/**
 * FAST-Assist Studio — OpenRouter Inference Proxy with Authorization
 *
 * Every request is authenticated and authorized before reaching OpenRouter:
 *
 *   1. Verify the Firebase ID Token (via Firebase Admin SDK).
 *   2. Read authorized_users/{uid} from Firestore.
 *   3. Reject if the user is missing or disabled (403), or token invalid (401).
 *   4. Only then forward to OpenRouter with the server-side OPENROUTER_API_KEY.
 *
 * The OpenRouter API key never reaches the browser. Firebase ID tokens are
 * verified cryptographically — the backend never trusts the frontend.
 *
 * ── Environment variables (server-side only, never VITE_) ────────────────────
 *   OPENROUTER_API_KEY   — OpenRouter secret key; absent → 503 response.
 *   GOOGLE_APPLICATION_CREDENTIALS — Path to service account JSON, or use ADC
 *                          (automatic on Cloud Run / GCP environments).
 *   DEV_SKIP_AUTH        — Set to 'true' in local dev to bypass Firebase Admin
 *                          auth when no GCP credentials are available.
 *                          IGNORED when NODE_ENV === 'production'.
 *
 * Security note: Never log OpenRouter API key, Firebase ID tokens, or secrets.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// ── Dev auth bypass ────────────────────────────────────────────────────────────
// Allows local development without GCP credentials.
// Unconditionally false in production — NODE_ENV is always 'production' on Cloud Run.

const DEV_SKIP_AUTH =
  process.env.NODE_ENV !== 'production' &&
  process.env.DEV_SKIP_AUTH === 'true'

// ── Firebase Admin (lazy singleton) ──────────────────────────────────────────
// Lazily imported on the first request to avoid top-level import failures in
// environments where firebase-admin is not configured (e.g. CI without ADC).

type AdminAuth      = import('firebase-admin/auth').Auth
type AdminFirestore = import('firebase-admin/firestore').Firestore

interface AdminServices { adminAuth: AdminAuth; adminDb: AdminFirestore }

let _adminServices: AdminServices | null = null
let _adminInitError: Error | null = null

async function getAdminServices(): Promise<AdminServices> {
  if (_adminServices)  return _adminServices
  if (_adminInitError) throw _adminInitError

  try {
    const { initializeApp, getApps } = await import('firebase-admin/app')
    const { getAuth }                 = await import('firebase-admin/auth')
    const { getFirestore }            = await import('firebase-admin/firestore')

    const app = getApps().length > 0 ? getApps()[0] : initializeApp()
    _adminServices = {
      adminAuth: getAuth(app),
      adminDb:   getFirestore(app),
    }
    return _adminServices
  } catch (err) {
    _adminInitError = err instanceof Error ? err : new Error(String(err))
    throw _adminInitError
  }
}

// ── Authorization error ────────────────────────────────────────────────────────

class AuthorizationError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

// ── Token verification + allowlist check ──────────────────────────────────────

async function verifyAndAuthorize(
  authHeader: string | string[] | undefined,
): Promise<{ uid: string; role: string }> {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader ?? ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) {
    console.log('[FAST-Assist][Auth] Missing Authorization header — 401')
    throw new AuthorizationError(401, 'Authorization required')
  }

  const { adminAuth, adminDb } = await getAdminServices()

  // Step 1: Verify the Firebase ID token cryptographically.
  let uid: string
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    uid = decoded.uid
  } catch (err) {
    console.log('[FAST-Assist][Auth] Invalid Firebase token:', (err as Error).message)
    throw new AuthorizationError(401, 'Invalid or expired token')
  }

  // Step 2: Read the authorized_users allowlist document.
  const docRef  = adminDb.collection('authorized_users').doc(uid)
  const docSnap = await docRef.get()

  if (!docSnap.exists) {
    console.log(`[FAST-Assist][Auth] Unknown user attempted access: uid=${uid}`)
    throw new AuthorizationError(403, 'User not authorised')
  }

  const data = docSnap.data()!
  if (data.enabled !== true) {
    console.log(`[FAST-Assist][Auth] Disabled user attempted access: uid=${uid}`)
    throw new AuthorizationError(403, 'User account is disabled')
  }

  const role = data.role as string
  console.log(`[FAST-Assist][Auth] Inference request authorised: uid=${uid} role=${role}`)
  return { uid, role }
}

// ── Body reader ────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Node.js-compatible request handler for /api/inference.
 *
 * Authorization is enforced on both HEAD (health probe) and POST (inference).
 * HEAD still returns 200/503 based on key presence, but only after auth passes.
 */
export async function inferenceHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''

  // ── Authorization check (both HEAD and POST) ─────────────────────────────
  if (!DEV_SKIP_AUTH) {
    try {
      await verifyAndAuthorize(req.headers['authorization'])
    } catch (err) {
      if (err instanceof AuthorizationError) {
        res.writeHead(err.statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
        return
      }
      // Firebase Admin not configured or transient Firestore error.
      console.error('[FAST-Assist][Auth] Authorization service error:', err)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Authorization service unavailable' }))
      return
    }
  } else {
    // DEV_SKIP_AUTH is active — log once so operators know auth is bypassed.
    if (req.method === 'POST') {
      console.log('[FAST-Assist][Auth] DEV_SKIP_AUTH active — bypassing Firebase Admin auth')
    }
  }

  // ── HEAD — lightweight health probe ────────────────────────────────────────
  // Returns 200 when OPENROUTER_API_KEY is set, 503 when absent.
  if (req.method === 'HEAD') {
    res.writeHead(apiKey ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

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
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  origin,
      'X-Title':       'FAST-Assist Studio',
    },
    body,
  })

  // Preserve the upstream HTTP status — callers rely on 401/403/429/5xx for retry decisions.
  res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
  res.end(await upstream.text())
}
