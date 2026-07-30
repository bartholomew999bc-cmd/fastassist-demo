# FAST-Assist Studio

**Vendor-Agnostic AI Ultrasound Assistant — v0.1**

A polished demonstration platform showcasing how a future AI-assisted ultrasound appliance would work in real time. Designed to communicate the FAST-Assist vision to clinicians, military leadership, investors and researchers.

## Tech Stack

- **React 19** + TypeScript + Vite
- **Tailwind CSS** — dark premium design system
- **Framer Motion** — smooth professional animations
- **Zustand** — application state management
- **TanStack Query** — server state management
- **Axios** — HTTP transport to AI inference endpoint

## Architecture

```
src/
├── types/          # Shared TypeScript interfaces (InferenceResult, etc.)
├── config/         # All runtime configuration (no hardcoded values)
├── state/          # Zustand store — single source of truth
├── services/       # Inference backends (REST, Mock) + InferenceService
├── hooks/          # useInference, useKeyboardShortcuts, useClock
├── utils/          # logger, smoothing, frameCapture
├── components/
│   ├── layout/     # TopBar, StatusBar
│   ├── ui/         # ConfidenceBar, StatusDot, Badge
│   ├── video/      # VideoPlayer
│   ├── overlay/    # OverlayRenderer (SVG/HTML overlays on video)
│   └── panels/     # InfoPanel (right sidebar)
├── pages/          # Studio (main page)
└── styles/         # Tailwind globals
public/
├── mock/           # Pre-authored JSON scenarios (ruq, luq, pelvis, etc.)
└── videos/         # Ultrasound demo video
```

## Running Locally

```bash
npm run dev       # Dev server on port 5000
npm run build     # Static production build → dist/
npm run preview   # Preview production build
```

## How It Works

1. Splash screen loads and animates through the startup sequence
2. Ultrasound video begins automatically
3. Every 2 seconds, the current frame is captured as JPEG
4. Frame is POSTed to `/infer` (configurable via `VITE_INFERENCE_ENDPOINT`)
5. AI returns structured JSON matching the canonical schema
6. Overlays animate: scan view badge, confidence arc, structure labels, guidance strip
7. If the endpoint is unreachable, seamlessly switches to Mock Mode (cycles through `/public/mock/*.json`)

## Deployment

This is a **fully static** application. The production image is ~55 MB (Node builder → nginx Alpine).

### Cloud Run (primary)

See `DEPLOY.md` for the full step-by-step guide. Quick reference:

```bash
# Build container (all VITE_* vars are baked in at build time)
docker build \
  --build-arg VITE_FIREBASE_API_KEY=... \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=... \
  --build-arg VITE_FIREBASE_PROJECT_ID=... \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=... \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=... \
  --build-arg VITE_FIREBASE_APP_ID=... \
  --build-arg VITE_OPENROUTER_API_KEY=... \
  -t gcr.io/PROJECT_ID/fast-assist-studio .

# Deploy
gcloud run deploy fast-assist-studio \
  --image gcr.io/PROJECT_ID/fast-assist-studio \
  --platform managed --region us-central1 --allow-unauthenticated
```

After deploying, add the Cloud Run URL to Firebase → Authentication → Authorized Domains.

### Local container test

```bash
docker run -p 8080:8080 -e PORT=8080 fast-assist-studio:local
curl http://localhost:8080/healthz   # → ok
```

### Static hosting (alternative)

```bash
npm run build
# Upload dist/ to Cloudflare Pages, Vercel, S3, etc.
```

## Inference Providers (RC2)

FAST-Assist Studio uses a provider-based inference architecture. All providers implement the same `InferenceBackend` interface and produce identical `InferenceResult` shapes — the examination workflow is identical regardless of which provider is active.

### Available Providers

| Provider      | Label          | Behaviour                                                         |
|---------------|----------------|-------------------------------------------------------------------|
| `hosted`      | Hosted AI      | POSTs frames to the configured endpoint; auto-falls back to mock. |
| `mock`        | Mock Provider  | Cycles pre-authored JSON scenarios from `/public/mock/`.          |

### Automatic Fallback

When Hosted AI is selected but the endpoint is unreachable, the system automatically falls back to the Mock Provider and sets connection status to `Fallback Active`. The examination continues without interruption. A background recovery probe runs every ~18 seconds; when the endpoint is found reachable again a notification appears in the Provider Selector and Info Panel so the operator can switch back manually.

### Adding a Future Provider

1. Add the new `ProviderType` value to `src/types/index.ts`.
2. Implement `InferenceBackend` in `src/services/`.
3. Add a descriptor to `PROVIDER_REGISTRY` in `src/services/ProviderRegistry.ts`.
4. Map the provider to a backend in `src/hooks/useInference.ts`.

No other files need to change.

## Configuration

All values are set via environment variables or `src/config/index.ts`:

| Variable                  | Default               | Description                                              |
|---------------------------|-----------------------|----------------------------------------------------------|
| `VITE_PROVIDER`           | `hosted`              | Default inference provider (`hosted` or `mock`)          |
| `VITE_INFERENCE_ENDPOINT` | `/infer`              | Hosted AI backend URL                                    |
| `VITE_INFERENCE_INTERVAL` | `1200`                | Frame capture interval (ms)                              |
| `VITE_VIDEO_PATH`         | `/videos/ultrasound.mp4` | Demo video path                                       |
| `VITE_DEBUG`              | `false`               | Verbose logging                                          |

## Keyboard Shortcuts

| Key | Action          |
|-----|-----------------|
| `F` | Toggle fullscreen |
| `T` | Toggle theme    |
| `Esc` | Exit fullscreen |

## Mock Scenarios

Located in `public/mock/`. Each JSON file matches the canonical InferenceResult schema:

- `ruq.json` — Right Upper Quadrant
- `luq.json` — Left Upper Quadrant
- `pelvis.json` — Pelvic view
- `cardiac.json` — Subcostal cardiac
- `positive_fast.json` — FAST positive (free fluid)
- `negative_fast.json` — FAST negative
- `poor_quality.json` — Poor image quality scenario

## Adding a New AI Backend

1. Implement `InferenceBackend` interface in `src/services/`
2. Add a case in `src/services/BackendFactory.ts`
3. Add the new `BackendType` to `src/types/index.ts`

No other code changes required.

## User Preferences

- Dark premium UI — no neon, no gradients, professional medical aesthetic
- Teal (#14b8a6) as the primary accent colour
- Animations via Framer Motion only — no CSS keyframe hacks
- All configuration via `src/config/index.ts` — no hardcoded values
- Static deployment only — no backend, no SSR

---

## Demo Video Pipeline

Produces `demo/FASTAssist_Product_Demo.mp4` — a 75-second, 1920×1080, 60fps H.264 product demo.

### Deliverables

| File | Description |
|------|-------------|
| `demo/FASTAssist_Product_Demo.mp4` | Final encoded video |
| `demo/presentation.html` | Standalone HTML presentation (all 10 scenes) |
| `demo/storyboard.json` | Scene descriptions and asset list |
| `demo/scene_timing.json` | Frame-accurate timing with crossfade data |
| `demo/scripts/render.mjs` | Playwright frame renderer |
| `demo/scripts/encode.sh` | FFmpeg H.264 encoder |
| `demo/frames/` | PNG frame sequence (4500 frames) |
| `demo/scene5_screenshot.png` | Mid-render screenshot from Scene 5 |

### Rendering pipeline

```bash
# 1. Install dependencies (first time only)
npm install
npx playwright install chromium

# 2. Render frames (4500 frames, ~75 seconds at 6fps render rate)
#    Split into batches to fit within timeout limits:
node demo/scripts/render.mjs --start    0 --end 1499 --batch 200
node demo/scripts/render.mjs --start 1500 --end 2999 --batch 200
node demo/scripts/render.mjs --start 3000 --end 4499 --batch 200

# 3. Encode to MP4
bash demo/scripts/encode.sh
```

### System requirements

The renderer uses the **NixOS system Chromium** (not Playwright's bundled binary):
```bash
# Already installed — no action needed
which chromium   # /nix/store/.../bin/chromium
```

### Re-rendering a range

To re-render specific frames (e.g. after editing `presentation.html`):
```bash
node demo/scripts/render.mjs --start 1650 --end 2130  # Scene 5 only
bash demo/scripts/encode.sh                            # Re-encode full video
```

### Scenes

| # | Name | Time | Key elements |
|---|------|------|-------------|
| 1 | Splash | 0–7s | Logo, rings, subtitle, live pill |
| 2 | Studio Layout | 6.5–14.5s | TopBar, sidebar, video panel, callouts |
| 3 | Anatomy Labels | 14–21.5s | Liver, Kidney, Morison's Pouch, Diaphragm |
| 4 | Probe Guidance | 21–28s | Probe marker, sweep arrows, orientation compass |
| 5 | Analyze Pipeline | 27.5–35.5s | Uploading → Processing → Inference → Results |
| 6 | Confidence Gating | 35–43s | 32% → 54% → 71% → 91% with status text |
| 7 | Struct Overlays | 42.5–50.5s | Anatomy overlays with glow |
| 8 | Free Fluid | 50–58s | AI assessment card + disclaimer |
| 9 | Features | 57.5–67.5s | Six feature callouts |
| 10 | Outro | 67–75s | Logo fade out |
