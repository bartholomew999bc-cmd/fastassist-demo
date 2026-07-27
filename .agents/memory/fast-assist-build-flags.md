---
name: FAST-Assist build flags
description: Difference between tsc --noEmit and npm run build for this project.
---

`tsconfig.app.json` has `"noUnusedLocals": true` and `"noUnusedParameters": true`.

- `npx tsc --noEmit` uses the root `tsconfig.json` (which has `"files": []`) and skips these strictness flags → can show zero errors even when unused locals exist.
- `npm run build` runs `tsc -b && vite build`, which respects project references and picks up `tsconfig.app.json` with all strict flags → authoritative.

**How to apply:** Always run `npm run build` (not `tsc --noEmit`) as the final verification step for this project.
