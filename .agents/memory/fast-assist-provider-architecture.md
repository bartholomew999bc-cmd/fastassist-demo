---
name: FAST-Assist RC2 provider architecture
description: How the dual inference provider system works after the RC2 sprint
---

## Provider interface

`ProviderType = 'hosted' | 'mock'` is the user-facing concept. Internally each provider maps to an `InferenceBackend` (`RESTBackend` or `MockBackend`). The two concepts are separate so future providers can be added without touching the UI.

## Key files

- `src/types/index.ts` — `ProviderType`, `ConnectionStatus` (includes `'fallback'`)
- `src/services/ProviderRegistry.ts` — display labels and colour mapping; add future providers here
- `src/hooks/useInference.ts` — restarts effect when `selectedProvider` changes; implements fallback + recovery probe
- `src/state/store.ts` — `selectedProvider`, `hostedAvailable`, `setSelectedProvider`, `setHostedAvailable`
- `src/components/ui/ProviderSelector.tsx` — dropdown in TopBar; shows recovery notice when applicable
- `src/config/index.ts` — `VITE_PROVIDER` env var (default `'hosted'`)

## Fallback behaviour

- `selectedProvider='hosted'`: health-checks endpoint on mount; on failure sets `connectionStatus='fallback'` and serves from mock
- Recovery probe every `RECOVERY_CHECK_INTERVAL=15` ticks (~18s at 1200ms interval); on success sets `hostedAvailable=true`
- Never auto-switches back — operator uses ProviderSelector to restore Hosted AI
- `selectedProvider='mock'`: skips health check entirely; always mock

**Why:** Examination workflow must continue uninterrupted through any provider transition. Both providers produce identical `InferenceResult` shapes so switching is seamless.

## Adding a future provider

1. Add value to `ProviderType` in `src/types/index.ts`
2. Implement `InferenceBackend` in `src/services/`
3. Add descriptor to `PROVIDER_REGISTRY` in `src/services/ProviderRegistry.ts`
4. Add dispatch case in `useInference.ts` tick function
