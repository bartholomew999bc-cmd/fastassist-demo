#!/usr/bin/env node
/**
 * FAST-Assist Studio — Inference connectivity test
 *
 * Sends one real API call to OpenRouter using a frame extracted from the
 * demo ultrasound video.  Verifies auth, image upload, model response, and
 * JSON parsing without touching the running dev server.
 *
 * Usage:  node scripts/test-inference.mjs
 *
 * The API key is read from VITE_OPENROUTER_API_KEY in the shell environment.
 * It is never printed.
 */

import { readFileSync } from 'node:fs';
import { resolve }      from 'node:path';

// ── 1. Environment check ──────────────────────────────────────────────────────

const API_KEY = process.env.VITE_OPENROUTER_API_KEY ?? '';
if (!API_KEY) {
  console.error('[FAIL] VITE_OPENROUTER_API_KEY is not set in the environment.');
  console.error('       Set the secret in Replit and restart the shell.');
  process.exit(1);
}
console.log(`[OK]  VITE_OPENROUTER_API_KEY present (length=${API_KEY.length})`);

// ── 2. Load test image ────────────────────────────────────────────────────────

const FRAME_PATH = '/tmp/test_frame.jpg';
let imageDataUrl;
try {
  const bytes = readFileSync(resolve(FRAME_PATH));
  imageDataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  console.log(`[OK]  Test frame loaded — ${bytes.length} bytes → ${imageDataUrl.length} base64 chars`);
} catch {
  console.error(`[FAIL] Could not read test frame at ${FRAME_PATH}`);
  console.error('       Run: ffmpeg -i public/videos/ultrasound.mp4 -vframes 1 -update 1 /tmp/test_frame.jpg');
  process.exit(1);
}

// ── 3. Model priority list (mirrors QwenVLProvider) ──────────────────────────

const MODELS = [
  'qwen/qwen2.5-vl-72b-instruct',
  'qwen/qwen2.5-vl-32b-instruct',
  'qwen/qwen2.5-vl-7b-instruct',
];

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const USER_PROMPT = `You are a clinical FAST ultrasound interpretation assistant.
Analyze the ultrasound image and respond with ONLY a JSON object:
{
  "scan_view": "<RUQ|LUQ|Pelvis|Subxiphoid|Cardiac|Thoracic|Unknown>",
  "confidence": <float 0-1>,
  "structures": ["<structure>"],
  "quality": { "overall": <float 0-1>, "motion": "<Stable|Minor motion|Motion artifact>", "gain": "<Adequate|Too high|Too low>", "depth": "<Optimal|Too shallow|Too deep>" },
  "guidance": "<one sentence>"
}`;

// ── 4. Try each model in order ────────────────────────────────────────────────

let succeeded = false;

for (const model of MODELS) {
  console.log(`\n[TRY] Model: ${model}`);
  const t0 = Date.now();

  const payload = {
    model,
    max_tokens:  600,
    temperature: 0.05,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: USER_PROMPT },
      ],
    }],
  };

  // Log payload shape (never log the key)
  console.log('[REQ] Payload shape:', JSON.stringify({
    model,
    max_tokens:  payload.max_tokens,
    temperature: payload.temperature,
    messages: [{ role: 'user', content: ['<image_url>', '<text_prompt>'] }],
  }, null, 2));

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer':  'https://fast-assist.app',
        'X-Title':       'FAST-Assist Studio',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (netErr) {
    console.error(`[FAIL] Network error: ${netErr.message}`);
    console.error('       Stage: network');
    continue;
  }

  const wallMs = Date.now() - t0;
  console.log(`[NET] HTTP ${response.status} — ${wallMs} ms`);

  const rawBody = await response.text().catch(() => '');

  if (!response.ok) {
    const stage =
      response.status === 401 || response.status === 403 ? 'authentication' :
      response.status === 404 || response.status === 422 ? 'model execution (model unavailable)' :
      response.status >= 500                             ? 'model execution (server error)' :
                                                           'request construction';

    console.error(`[FAIL] HTTP ${response.status} — Stage: ${stage}`);
    console.error(`[BODY] ${rawBody.slice(0, 500)}`);

    if (response.status === 401 || response.status === 403) {
      console.error('[STOP] Auth failure — not retrying with other models.');
      process.exit(1);
    }
    // Model unavailable — try next
    continue;
  }

  // ── 5. Parse response ───────────────────────────────────────────────────────

  let json;
  try {
    json = JSON.parse(rawBody);
  } catch (parseErr) {
    console.error(`[FAIL] JSON parse error: ${parseErr.message} — Stage: response parsing`);
    console.error(`[BODY] ${rawBody.slice(0, 500)}`);
    continue;
  }

  const rawText = json?.choices?.[0]?.message?.content ?? '';
  const usage   = json?.usage ?? {};

  console.log('\n[OK]  Inference succeeded!');
  console.log(`      Model used:       ${model}`);
  console.log(`      Latency:          ${wallMs} ms`);
  console.log(`      Prompt tokens:    ${usage.prompt_tokens ?? 'N/A'}`);
  console.log(`      Completion tokens:${usage.completion_tokens ?? 'N/A'}`);
  console.log('\n[RAW] Model response text:');
  console.log(rawText);

  // ── 6. Parse application response ──────────────────────────────────────────

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('\n[PARSED] Application response:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.warn('[WARN] Could not re-parse JSON block from model text');
    }
  }

  console.log('\n[FULL] Raw OpenRouter response:');
  // Omit the message content to keep output readable (already printed above)
  const summarised = { ...json };
  if (summarised.choices) summarised.choices = summarised.choices.map(c => ({ ...c, message: { role: c.message?.role, content: '<shown above>' } }));
  console.log(JSON.stringify(summarised, null, 2));

  succeeded = true;
  break;
}

if (!succeeded) {
  console.error('\n[FAIL] All models exhausted — inference could not be completed.');
  process.exit(1);
}
