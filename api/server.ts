/**
 * FAST-Assist Studio — Inference Proxy HTTP Server
 *
 * Minimal Node.js HTTP server that exposes the OpenRouter proxy on a
 * loopback port so nginx can reverse-proxy /api/inference to it in the
 * production Docker container.
 *
 * Listens on 127.0.0.1:${PROXY_PORT} (default 9001).
 * nginx forwards POST /api/inference → http://127.0.0.1:9001/api/inference.
 *
 * Environment variables:
 *   OPENROUTER_API_KEY  — OpenRouter secret key (server-side only)
 *   PROXY_PORT          — Listening port (default 9001)
 */

import { createServer } from 'node:http'
import { inferenceHandler } from './inference'

const PORT = Number(process.env.PROXY_PORT ?? '9001')

const server = createServer(async (req, res) => {
  // Only handle /api/inference — everything else is served by nginx.
  if (req.url === '/api/inference' || req.url === '/api/inference/') {
    await inferenceHandler(req, res).catch(err => {
      console.error('[inference-proxy] Unhandled error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal proxy error' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[inference-proxy] listening on 127.0.0.1:${PORT}`)
})

server.on('error', err => {
  console.error('[inference-proxy] Server error:', err)
  process.exit(1)
})
