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

This is a **fully static** application. Build produces only HTML/CSS/JS/assets.

```bash
npm run build
# Upload the dist/ folder to any static host:
# Cloudflare Pages, GitHub Pages, Vercel, AWS S3, Nginx, cPanel, etc.
```

## Configuration

All values are set via environment variables or `src/config/index.ts`:

| Variable                  | Default               | Description                        |
|---------------------------|-----------------------|------------------------------------|
| `VITE_INFERENCE_ENDPOINT` | `/infer`              | AI backend URL                     |
| `VITE_INFERENCE_INTERVAL` | `2000`                | Frame capture interval (ms)        |
| `VITE_VIDEO_PATH`         | `/videos/ultrasound.mp4` | Demo video path                 |
| `VITE_DEMO_MODE`          | `false`               | Force mock mode                    |
| `VITE_DEBUG`              | `false`               | Verbose logging                    |

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
