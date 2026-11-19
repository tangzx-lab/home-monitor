import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

async function proxy(req, res, url) {
  const base = url.searchParams.get("base") || "http://192.168.4.1";
  const path = url.searchParams.get("path") || "/api";
  const target = new URL(path, base);
  try {
    const response = await fetch(target, { method: req.method });
    const body = await response.arrayBuffer();
    res.writeHead(response.status, {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    res.end(Buffer.from(body));
  } catch (error) {
    send(
      res,
      200,
      JSON.stringify({
        ok: 0,
        proxyError: true,
        target: target.toString(),
        message: error.message || "ESP32 connection failed",
      }),
      "application/json; charset=utf-8",
    );
  }
}

async function staticFile(res, pathname) {
  const cleanPath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, cleanPath);
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }
  const body = await readFile(filePath);
  send(res, 200, body, mime[extname(filePath)] || "application/octet-stream");
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/proxy") {
      await proxy(req, res, url);
      return;
    }
    await staticFile(res, decodeURIComponent(url.pathname));
  } catch (error) {
    send(res, error.code === "ENOENT" ? 404 : 502, error.message || "Server error");
  }
}).listen(port, () => {
  console.log(`Front preview: http://localhost:${port}`);
});
