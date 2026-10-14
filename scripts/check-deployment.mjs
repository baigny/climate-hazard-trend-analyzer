// A Netlify frontend needs a public API; /api is only proxied in local Vite.
const value = process.env.VITE_API_URL;
let url;
try {
  url = new URL(value);
} catch {
  throw new Error('Set VITE_API_URL in Netlify to the hosted HTTPS backend origin.');
}
if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
  throw new Error('VITE_API_URL must be a public HTTPS origin, without /api or credentials.');
}
