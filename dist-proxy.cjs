// api/server.ts
var import_node_http = require("node:http");

// api/inference.ts
var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function inferenceHandler(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  if (req.method === "HEAD") {
    if (apiKey) {
      res.writeHead(200, { "Content-Type": "application/json" });
    } else {
      res.writeHead(503, { "Content-Type": "application/json" });
    }
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  if (!apiKey) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "OPENROUTER_API_KEY is not configured on the server" }));
    return;
  }
  let body;
  try {
    body = await readBody(req);
    JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid request body" }));
    return;
  }
  const origin = Array.isArray(req.headers["origin"]) ? req.headers["origin"][0] : req.headers["origin"] ?? "https://fast-assist.app";
  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": origin,
      "X-Title": "FAST-Assist Studio"
    },
    body
  });
  res.writeHead(upstream.status, { "Content-Type": "application/json" });
  res.end(await upstream.text());
}

// api/server.ts
var PORT = Number(process.env.PROXY_PORT ?? "9001");
var server = (0, import_node_http.createServer)(async (req, res) => {
  if (req.url === "/api/inference" || req.url === "/api/inference/") {
    await inferenceHandler(req, res).catch((err) => {
      console.error("[inference-proxy] Unhandled error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal proxy error" }));
      }
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[inference-proxy] listening on 127.0.0.1:${PORT}`);
});
server.on("error", (err) => {
  console.error("[inference-proxy] Server error:", err);
  process.exit(1);
});
