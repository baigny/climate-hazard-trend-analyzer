"""Bound API bodies before parsing, including streamed/chunked requests."""
import asyncio
from urllib.parse import urlsplit
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class APIBoundary:
    def __init__(self, app, origins, max_bytes=16384):
        self.app, self.origins, self.max_bytes = app, set(origins), max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)

        async def secure_send(message):
            if message["type"] == "http.response.start":
                message["headers"] = list(message.get("headers", [])) + [(k.lower().encode(), v.encode()) for k, v in HEADERS.items()]
                if scope["path"].startswith("/api/"):
                    cache = "public, max-age=86400" if scope["path"].startswith("/api/locations/") and message["status"] == 200 else "no-store"
                    message["headers"].append((b"cache-control", cache.encode()))
            await send(message)

        async def reject(status, detail):
            await JSONResponse({"detail": detail}, status_code=status)(scope, receive, secure_send)

        if scope["path"].startswith("/api/") and scope["method"] in ("POST", "PUT", "PATCH"):
            origin = headers.get("origin")
            if origin:
                try:
                    parsed = urlsplit(origin)
                except ValueError:
                    return await reject(403, "Request origin is not allowed.")
                # TLS may terminate at a trusted reverse proxy before reaching ASGI.
                same_origin = parsed.scheme in (scope.get("scheme"), "https") and parsed.netloc == headers.get("host")
                if origin not in self.origins and not same_origin:
                    return await reject(403, "Request origin is not allowed.")
            if headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
                return await reject(415, "Use application/json for API requests.")
            length = headers.get("content-length")
            if length is not None and (not length.isdigit() or int(length) > self.max_bytes):
                return await reject(413, "Request body too large.")
            body = bytearray()
            try:
                async with asyncio.timeout(15):
                    while True:
                        message = await receive()
                        if message["type"] == "http.disconnect":
                            return
                        body.extend(message.get("body", b""))
                        if len(body) > self.max_bytes:
                            return await reject(413, "Request body too large.")
                        if not message.get("more_body", False):
                            break
            except TimeoutError:
                return await reject(408, "Request body timed out.")
            delivered = False

            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            return await self.app(scope, bounded_receive, secure_send)
        await self.app(scope, receive, secure_send)
