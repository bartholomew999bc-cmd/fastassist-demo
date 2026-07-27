---
name: FAST-Assist build flags
description: How to correctly check TypeScript errors in this project
---

`tsc --noEmit` misses `noUnusedLocals` errors; `npm run build` (`tsc -b`) is the authoritative check.

**Why:** The project uses `tsc -b` (composite project references) in the build script, which enforces stricter checks than a plain `tsc --noEmit`. Use `npm run build` for the final gate before shipping.

**How to apply:** Always run `npm run build` (not just `tsc --noEmit`) when verifying that code is production-ready.
