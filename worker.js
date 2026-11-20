// Cloudflare Worker: read-only proxy for archive.org (adds CORS headers). Optional.
const HOSTS = /^(?:[a-z0-9-]+\.)*(?:archive\.org|us\.archive\.org)$/i;
const PATHS = [/^\/download\//, /^\/metadata\//, /^\/advancedsearch\.php$/, /^\/services\/img\//];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "range, content-type",
  "access-control-expose-headers": "content-length, content-range, accept-ranges, content-disposition",
};
export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: CORS });
    const q = new URL(req.url).searchParams;
    let t;
    try { t = new URL(q.get("u") || ""); } catch (e) { return new Response("Bad url", { status: 400, headers: CORS }); }
    if (t.protocol !== "https:" || !HOSTS.test(t.hostname) || !PATHS.some((p) => p.test(t.pathname)))
      return new Response("Forbidden", { status: 403, headers: CORS });
    const h = new Headers();
    const r = req.headers.get("range");
    if (r) h.set("range", r);
    const up = await fetch(t.toString(), { method: req.method, headers: h, redirect: "follow" });
    const out = new Headers(up.headers);
    for (const k of Object.keys(CORS)) out.set(k, CORS[k]);
    out.delete("set-cookie");
    if (q.get("dl") === "1") {
      const n = (q.get("n") || t.pathname.split("/").pop() || "book.pdf").replace(/[^\w.\- ()؀-ۿ]+/g, "_");
      out.set("content-disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(n));
    }
    return new Response(up.body, { status: up.status, headers: out });
  },
};
