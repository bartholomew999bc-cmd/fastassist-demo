/**
 * FAST-Assist Studio — OpenRouter Inference Proxy
 *
 * Minimal secure proxy: receives inference requests from the browser,
 * injects the server-side OPENROUTER_API_KEY, and forwards to OpenRouter.
 * The API key never reaches the browser.
 *
 * Used as Vite configureServer middleware in development (imported by vite.config.ts).
 * For production containers, mount this handler behind a Node.js HTTP server
 * listening on a separate port and proxy /api/inference from nginx.
 *
 * Environment variable (server-side only — never VITE_):
 *   OPENROUTER_API_KEY  — OpenRouter secret key; absent → 503 response.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Collect the full request body as a UTF-8 string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Node.js-compatible request handler for POST /api/inference.
 *
 * Responsibilities:
 *  - Reject non-POST requests with 405
 *  - Return 503 when OPENROUTER_API_KEY is absent
 *  - Validate the request body is parseable JSON before forwarding
 *  - Forward the body to OpenRouter with the server-side Authorization header
 *  - Return the upstream response (status + body) unchanged
 */
export async function inferenceHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'OPENROUTER_API_KEY is not configured on the server' }))
    return
  }

  let body: string
  try {
    body = await readBody(req)
    JSON.parse(body) // validate — throw on malformed input
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid request body' }))
    return
  }

  const origin = Array.isArray(req.headers['origin'])
    ? req.headers['origin'][0]
    : (req.headers['origin'] ?? 'https://fast-assist.app')

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': origin,
      'X-Title': 'FAST-Assist Studio',
    },
    body,
  })

  // Preserve the upstream HTTP status — callers rely on 401/403/429/5xx for retry decisions.
  res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
  res.end(await upstream.text())
}
