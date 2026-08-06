---
name: FAST-Assist authorization layer
description: Firestore allowlist-based authorization added on top of Firebase Auth — architecture decisions and key patterns.
---

# Authorization Layer

## Architecture
- Two-phase check: Phase 1 = Firebase Auth (Google Sign-In), Phase 2 = Firestore `authorized_users/{uid}` fetch.
- `AuthStatus` state machine: `checking-auth → checking-authorization → authorized | unauthenticated | access-denied | error`.
- On denial, user is signed out server-side *before* showing AccessDeniedPage — Firebase session is already cleared.

## Key files
- `src/auth/AuthProvider.tsx` — owns the state machine; syncs `userRole` to both React context and Zustand store.
- `src/auth/AccessDeniedPage.tsx` — shown on access-denied; user already signed out.
- `src/auth/ProtectedRoute.tsx` — routes all six `authStatus` values to correct UI.
- `api/inference.ts` — Firebase Admin verifies ID token + reads Firestore before forwarding to OpenRouter.
- `src/services/QwenVLProvider.ts` — attaches `Authorization: Bearer <idToken>` to every HEAD + POST.
- `scripts/authorize-user.mjs` — CLI to write `authorized_users/{uid}` documents.
- `firestore.rules` — clients can read only their own doc; writes restricted to Admin SDK.

## Firestore document schema
Collection: `authorized_users`, document ID = Firebase UID.
```json
{ "email": "...", "displayName": "...", "role": "operator|admin|viewer", "enabled": true, "createdAt": Timestamp }
```

## Backend bypass (dev only)
`DEV_SKIP_AUTH=true` (+ `NODE_ENV !== production`) skips Firebase Admin verification in local dev without GCP creds. Ignored in production.

## Why UID not email
UID is the stable Firebase identifier; email can change. All authorization lookups use UID as the document ID.

## Token attachment
`getFirebaseIdToken()` in QwenVLProvider calls `user.getIdToken(false)` — Firebase handles refresh automatically. Returns null in dev-bypass (auth not initialized); backend's `DEV_SKIP_AUTH` handles that case.

## UserRole in Zustand store
Role is stored in `AppState.userRole` (selector: `selectUserRole`) for future role-gated UI. `AuthProvider` calls `useAppStore.getState().setUserRole(role)` imperatively alongside its own React state.
