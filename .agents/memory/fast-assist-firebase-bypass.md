---
name: FAST-Assist Firebase dev bypass
description: Why the VITE_DEV_AUTH_BYPASS guard must live in firebase.ts, not only in AuthProvider.tsx
---

# FAST-Assist Firebase dev bypass

## The rule
The `DEV_BYPASS` check (`import.meta.env.DEV && VITE_DEV_AUTH_BYPASS === 'true'`) must appear in `src/lib/firebase.ts` to gate `initializeApp()` and `getAuth()`. It is not sufficient to guard calls in `AuthProvider.tsx` alone.

**Why:** `import { auth } from '@/lib/firebase'` is a static ES module import. JavaScript executes the imported module's top-level code immediately when the module is first loaded — before any runtime checks in the importing file. So `initializeApp(firebaseConfig)` runs at load time even if `DEV_AUTH_BYPASS_ACTIVE` is true and every Firebase call in AuthProvider is guarded.

Without the guard in firebase.ts, Firebase initializes with undefined env vars (no credentials set), which causes errors or hangs in dev bypass mode.

**How to apply:** When editing firebase.ts, keep the conditional init pattern:
```ts
const DEV_BYPASS = import.meta.env.DEV === true && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
if (!DEV_BYPASS) {
  _app = ...; _auth = getAuth(_app);
}
export const auth = _auth as Auth;
export default _app as FirebaseApp;
```
Vite's production build replaces `import.meta.env.DEV` with `false`, dead-code-eliminating the bypass branch entirely.
