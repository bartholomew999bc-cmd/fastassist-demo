# FAST-Assist Studio

**Vendor-Agnostic AI Ultrasound Assistant — v0.2.0**

A production-ready demonstration platform showcasing how a future AI-assisted ultrasound appliance would work in real time. Designed to communicate the FAST-Assist vision to clinicians, military leadership, investors, and researchers.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Environment Variables](#environment-variables)
4. [Running Locally](#running-locally)
5. [Building for Production](#building-for-production)
6. [Deploying to Cloud Run](#deploying-to-cloud-run)
7. [Deploying to App Engine](#deploying-to-app-engine)
8. [Deploying to Shared Hosting / Nginx / Apache](#deploying-to-shared-hosting)
9. [Deploying with Docker](#deploying-with-docker)
10. [Deploying to Hostinger](#deploying-to-hostinger)
11. [Mock Mode](#mock-mode)
12. [OpenRouter / AI Configuration](#openrouter--ai-configuration)
13. [Keyboard Shortcuts](#keyboard-shortcuts)
14. [Inference Providers](#inference-providers)
15. [Troubleshooting](#troubleshooting)

---

## Overview

FAST-Assist Studio is a **fully static** React + TypeScript application.

- Runs entirely in the browser — no server-side code
- Connects to Qwen2.5-VL via OpenRouter for real-time AI ultrasound analysis
- Falls back to Mock Mode automatically when no API key is present
- Supports demo video, file upload, webcam, and synthetic canvas as video sources

---

## Architecture

```
src/
├── config/             Runtime configuration (all VITE_ env vars)
├── types/              Shared TypeScript interfaces
│   ├── index.ts        Core types: InferenceResult, ExamSessionStep, etc.
│   └── inference.ts    Extended: FullInferenceResult, InferenceTelemetry
├── state/
│   ├── store.ts        Zustand store — single source of truth
│   └── inferenceLog.ts Rolling session log for Inspector panel
├── services/
│   ├── QwenVLProvider.ts   OpenRouter / Qwen2.5-VL integration
│   ├── MockBackend.ts      Offline demonstration backend
│   ├── RESTBackend.ts      Generic REST inference backend
│   ├── BackendFactory.ts   Factory for creating backends by type
│   ├── ProviderRegistry.ts Provider metadata and label helpers
│   └── adapters/
│       └── QwenMetadataAdapter.ts  Raw → CanonicalMetadata parser
├── hooks/
│   ├── useInference.ts     Frame → AI → state loop
│   ├── useIngest.ts        Video source management
│   ├── useClock.ts         HH:MM:SS clock
│   └── useKeyboardShortcuts.ts
├── ingest/
│   ├── VideoIngestManager.ts   Pipeline orchestrator
│   ├── FrameExtractor.ts       Canvas frame capture
│   ├── FrameQueue.ts           Frame buffer
│   ├── Preprocessor.ts         JPEG encoding + resize
│   ├── IngestContext.tsx        React context wrapper
│   ├── IngestEvents.ts         Event bus
│   ├── IVideoSource.ts         Source interface
│   └── sources/                Demo, Upload, Webcam, Synthetic, etc.
├── exam/
│   └── sessionMeta.ts      FAST exam state machine metadata
├── components/
│   ├── layout/             TopBar, StatusBar
│   ├── ui/                 ConfidenceBar, StatusDot, Badge, ProviderSelector, SourceSelector
│   ├── video/              SourceRenderer, SyntheticUltrasound
│   ├── overlay/            OverlayRenderer (SVG/HTML on video)
│   ├── panels/             InfoPanel, InspectorPanel
│   └── SplashScreen.tsx
├── pages/
│   └── Studio.tsx          Main application page
└── utils/
    ├── logger.ts           Structured logging
    └── smoothing.ts        EMA, clamp, formatters
public/
├── mock/                   Pre-authored JSON scenarios
└── videos/                 Demo ultrasound video (optional)
```

### Key Design Decisions

- **InferenceBackend interface** — all providers implement the same interface, making the exam workflow provider-agnostic
- **IngestContext singleton** — one VideoIngestManager shared across all components
- **Zustand store** — single source of truth; no prop drilling
- **Lazy-loaded Studio** — SplashScreen renders before the main bundle parses
- **No backend required** — all inference goes to OpenRouter directly from the browser

---

## Environment Variables

All variables are prefixed `VITE_` and are **inlined at build time** by Vite. They cannot be changed at runtime without rebuilding.

| Variable | Default | Description |
|---|---|---|
| `VITE_OPENROUTER_API_KEY` | *(empty)* | OpenRouter API key. When absent → Mock Mode. |
| `VITE_PROVIDER` | `hosted` | Default provider: `hosted` or `mock` |
| `VITE_INFERENCE_ENDPOINT` | `/infer` | REST backend URL (RESTBackend only, not OpenRouter) |
| `VITE_INFERENCE_INTERVAL` | `1200` | Frame capture interval in ms |
| `VITE_VIDEO_PATH` | `/videos/ultrasound.mp4` | Demo video path |
| `VITE_THEME` | `dark` | Default theme: `dark` or `light` |
| `VITE_DEBUG` | `false` | Enable verbose browser console logging |

Copy `.env.example` to `.env.local` to configure a local development environment.

> **Security:** `VITE_OPENROUTER_API_KEY` is embedded in the JavaScript bundle at build time. For production deployments, consider whether client-side key exposure is acceptable for your threat model. For maximum security, proxy OpenRouter calls through your own backend and omit the key from the build.

---

## Running Locally

```bash
# Clone and install
git clone <repo-url>
cd fast-assist-studio
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local and set VITE_OPENROUTER_API_KEY

# Start dev server (http://localhost:5000)
npm run dev
```

The dev server runs on port **5000** and allows all hosts (suitable for Replit, Gitpod, Codespaces).

---

## Building for Production

```bash
npm run build
```

Output is written to `dist/`. The build:
- TypeScript-checks all source files (`tsc -b`)
- Vite tree-shakes and bundles everything
- Splits chunks: vendor / motion / query / icons / app
- Produces only static HTML + JS + CSS + assets — no server required

### Preview the production build locally

```bash
npm run preview
# Serves dist/ at http://localhost:5000
```

---

## Deploying to Cloud Run

FAST-Assist Studio is a static SPA. The recommended approach is to serve it from Cloud Run using the included nginx Docker image.

### Step 1 — Build the Docker image

```bash
docker build \
  --build-arg VITE_OPENROUTER_API_KEY=your_key_here \
  -t gcr.io/YOUR_PROJECT/fast-assist-studio:latest .
```

### Step 2 — Push to Container Registry

```bash
docker push gcr.io/YOUR_PROJECT/fast-assist-studio:latest
```

### Step 3 — Deploy to Cloud Run

```bash
gcloud run deploy fast-assist-studio \
  --image gcr.io/YOUR_PROJECT/fast-assist-studio:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 80
```

Cloud Run will assign a public HTTPS URL automatically.

---

## Deploying to App Engine

### Step 1 — Build the static assets

```bash
VITE_OPENROUTER_API_KEY=your_key npm run build
```

### Step 2 — Create `app.yaml`

```yaml
runtime: python39
handlers:
  - url: /assets/(.*)
    static_files: dist/assets/\1
    upload: dist/assets/.*
    expiration: "365d"

  - url: /mock/(.*)
    static_files: dist/mock/\1
    upload: dist/mock/.*
    expiration: "0s"

  - url: /videos/(.*)
    static_files: dist/videos/\1
    upload: dist/videos/.*
    expiration: "7d"

  - url: /(.*)
    static_files: dist/index.html
    upload: dist/index.html
    expiration: "0s"
```

### Step 3 — Deploy

```bash
gcloud app deploy
```

---

## Deploying to Shared Hosting

### Nginx

1. Build: `VITE_OPENROUTER_API_KEY=... npm run build`
2. Copy `dist/` to your web root, e.g. `/var/www/fast-assist/`
3. Copy `nginx.conf` to `/etc/nginx/conf.d/fast-assist.conf` and update the `root` path
4. Reload nginx: `sudo nginx -s reload`

The included `nginx.conf` handles:
- SPA history API fallback (`try_files $uri $uri/ /index.html`)
- Immutable cache headers for hashed assets
- gzip compression
- Security headers

### Apache

Create a `.htaccess` in your web root:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]

# Cache hashed assets for 1 year
<FilesMatch "\.(js|css)$">
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>

# No cache for HTML
<FilesMatch "\.html$">
  Header set Cache-Control "no-cache, no-store, must-revalidate"
</FilesMatch>
```

---

## Deploying with Docker

```bash
# Build (key is embedded in the JS bundle at build time)
docker build \
  --build-arg VITE_OPENROUTER_API_KEY=your_key_here \
  -t fast-assist-studio .

# Run on port 8080
docker run -p 8080:80 fast-assist-studio

# Or with docker-compose:
# docker-compose up
```

The image is multi-stage:
1. **builder** — Node 20 Alpine: installs deps and builds assets
2. **runtime** — nginx 1.27 Alpine: serves dist/ (~15 MB final image)

---

## Deploying to Hostinger

1. Build locally: `VITE_OPENROUTER_API_KEY=your_key npm run build`
2. In Hostinger hPanel, open **File Manager** or connect via FTP
3. Navigate to `public_html/` (or a subdirectory for a subdomain)
4. Upload the entire contents of `dist/` — not the folder itself, just its contents
5. Ensure `index.html` is in the root of `public_html/`
6. For SPA routing to work, create `.htaccess` with the Apache rewrite rules above

---

## Mock Mode

Mock Mode serves pre-authored JSON scenarios from `public/mock/` instead of calling OpenRouter. The application automatically uses Mock Mode when:

- `VITE_OPENROUTER_API_KEY` is not set, **or**
- The operator selects "Mock Provider" in the UI, **or**
- The OpenRouter endpoint is unreachable (automatic fallback)

### Available scenarios

| File | Description |
|---|---|
| `ruq.json` | Right Upper Quadrant |
| `luq.json` | Left Upper Quadrant |
| `pelvis.json` | Pelvic view |
| `cardiac.json` | Subcostal cardiac |
| `positive_fast.json` | FAST positive (free fluid detected) |
| `negative_fast.json` | FAST negative |
| `poor_quality.json` | Poor image quality scenario |

### Demo video

Place an ultrasound MP4 at `public/videos/ultrasound.mp4`. If the file is absent, the app automatically renders a synthetic animated ultrasound canvas — **no code changes are needed** to switch between the two.

---

## OpenRouter / AI Configuration

FAST-Assist Studio uses **Qwen2.5-VL-7B-Instruct** via the OpenRouter API for vision-language inference.

1. Create an account at [openrouter.ai](https://openrouter.ai)
2. Generate an API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. Set `VITE_OPENROUTER_API_KEY` in your `.env.local` or as a build argument

### Inference reliability (RC4)

- **25 s hard timeout** per request via AbortController — the application never freezes
- **One automatic retry** on transient failures (network errors, 429, 5xx)
- **Graceful fallback** to Mock Mode on any persistent failure
- Auth errors (401, 403) surface immediately without retry
- Background recovery probe every ~18 s: when OpenRouter becomes reachable again, the UI notifies the operator

### Switching models

Edit `MODEL` in `src/services/QwenVLProvider.ts`. Any OpenRouter vision model that produces structured JSON output is compatible.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F` | Toggle fullscreen |
| `T` | Toggle dark/light theme |
| `Esc` | Exit fullscreen |

---

## Inference Providers

| Provider | Label | Behaviour |
|---|---|---|
| `hosted` | Hosted AI | POSTs frames to OpenRouter (Qwen2.5-VL); auto-falls back to Mock on failure |
| `mock` | Mock Provider | Cycles pre-authored JSON from `public/mock/` |

Providers are switched at runtime via the TopBar selector — no page reload required.

### Adding a new provider

1. Add the new `ProviderType` value to `src/types/index.ts`
2. Implement `InferenceBackend` in `src/services/`
3. Add a descriptor to `PROVIDER_REGISTRY` in `src/services/ProviderRegistry.ts`
4. Add a case to `useInference.ts`

No other files need to change.

---

## Troubleshooting

### App shows Mock Mode even with API key set

- Verify `VITE_OPENROUTER_API_KEY` is set **before** running `npm run build` or `npm run dev` — it is baked in at build time
- Confirm the key is valid at [openrouter.ai/keys](https://openrouter.ai/keys)
- Open the browser console (F12) and look for `[FAST-Assist][QwenVLProvider]` log lines
- Open the Inference Inspector (click `</>` in the top bar) to see raw API responses

### Routes return 404 after page refresh

The app uses the HTML5 History API. Your server must return `index.html` for all non-file routes:
- **nginx**: included `nginx.conf` handles this with `try_files $uri $uri/ /index.html`
- **Apache**: use the `.htaccess` rules in the [Apache section](#apache)
- **App Engine**: use the catch-all handler in `app.yaml`

### Video does not play

- Verify `public/videos/ultrasound.mp4` exists and is a valid MP4
- If the file is missing, the app silently falls back to the synthetic canvas source — this is expected behaviour
- Check the browser console for `[FAST-Assist][SourceRenderer]` warnings

### Build fails with TypeScript errors

```bash
npx tsc --noEmit
```

This shows all type errors. The project uses `strict: true`, `noUnusedLocals: true`, and `noUnusedParameters: true`.

### Docker image is large

The multi-stage build uses `node:20-alpine` (builder) and `nginx:1.27-alpine` (runtime). The final image should be ~15–25 MB. If it is larger, check that `.dockerignore` is in place — `node_modules` should never be copied to the runtime stage.

### Inference is slow

- The free Qwen2.5-VL-7B model on OpenRouter has variable latency (typically 3–15 s per frame)
- Increase `VITE_INFERENCE_INTERVAL` to reduce how often frames are sent
- For production use, consider a paid OpenRouter tier or self-hosted model
