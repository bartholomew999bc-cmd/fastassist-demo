---
name: FAST-Assist exam session architecture
description: How ExamSessionStep, ExamPhase, and the MockBackend pin cooperate to drive workflow-based examination progression.
---

The app has two orthogonal exam state concepts:

- **`ExamPhase`** (`'acquiring' | 'awaiting_confirmation'`) — low-level; checked by `useInference` tick to pause the inference loop while operator reviews a frozen result.
- **`ExamSessionStep`** (11-state enum in `src/types/index.ts`) — high-level; drives which window is active, progress display, and MockBackend pinning.

**State transition tables** live in `src/exam/sessionMeta.ts` (`FREEZE_STEP`, `CONFIRM_STEP`, `REACQUIRE_STEP`). Store actions (`freezeOnResult`, `confirmView`, `reacquire`) look up the next step from those tables.

**Inference gating** in `useInference.ts`:
1. If `examStep` is `idle`, `ready`, or `complete` → tick is a no-op.
2. If `examPhase === 'awaiting_confirmation'` → tick is a no-op.
3. After `MIN_ACQUISITION_FRAMES = 4` frames, a qualifying result calls `freezeOnResult`.

**MockBackend pinning**: `mockBackend.pinToWindow(scenarioId)` is called each tick to serve the scenario matching the current acquisition window (ruq/luq/pelvis/cardiac), preventing the old round-robin cycling.

**Why:** Keeps ExamPhase stable (existing overlay/loop code unchanged) while adding full 11-state clinical progression on top.
