import { QueryClient, queryOptions } from "@tanstack/react-query";

export const API = (
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env
    .VITE_API_URL || ""
).replace(/\/$/, "");
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      gcTime: 15 * 60_000,
    },
  },
});

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(
    path === "/analyses" || path.includes("/series?") ? 600_000 : 15_000,
  );
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const response = await fetch(`${API}/api${path}`, {
    ...init,
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : data.detail?.map((e: { msg: string }) => e.msg).join("; ") ||
            message;
    } catch {
      /* Keep status if not JSON. */
    }
    if (response.status === 429)
      message += ` Retry after ${response.headers.get("Retry-After") || "60"} seconds.`;
    throw new Error(message);
  }
  return response.json();
}

export function locationOptions<T>(path: string) {
  return queryOptions({
    queryKey: ["api", "GET", path],
    queryFn: () => requestJson<T>(path),
    staleTime: 24 * 60 * 60_000,
  });
}

// Cancel this consumer's interest while preserving shared work for other readers.
function subscribed<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const aborted = () =>
      reject(new DOMException("Selection changed", "AbortError"));
    signal.addEventListener("abort", aborted, { once: true });
    promise
      .then(
        (value) => {
          if (!signal.aborted) resolve(value);
        },
        (error) => {
          if (!signal.aborted) reject(error);
        },
      )
      .finally(() => signal.removeEventListener("abort", aborted));
    if (signal.aborted) aborted();
  });
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.signal?.aborted)
    throw new DOMException("Selection changed", "AbortError");
  let promise: Promise<T>;
  if (
    path.startsWith("/locations/") &&
    (!init?.method || init.method === "GET")
  ) {
    promise = queryClient.fetchQuery(locationOptions<T>(path));
  } else {
    promise = requestJson<T>(path, init);
  }
  return subscribed(promise, init?.signal);
}
