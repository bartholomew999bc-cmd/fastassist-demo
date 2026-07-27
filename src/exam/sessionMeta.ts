/**
 * FAST-Assist Studio — Examination Session Metadata
 *
 * Pure data: labels, step ordering, and transition tables.
 * No React, no side effects — safe to import anywhere.
 */

import type { ExamSessionStep } from '@/types';

// ─── Per-window metadata ──────────────────────────────────────────────────────

export interface ExamWindowInfo {
  /** The acquiring_* step */
  step: ExamSessionStep;
  /** The awaiting_* step */
  awaitStep: ExamSessionStep;
  /** Full human-readable window name */
  label: string;
  /** Abbreviated label for progress indicators */
  shortLabel: string;
  /** Mock scenario id to pin while acquiring this window */
  scenarioId: string;
}

export const EXAM_WINDOWS: ExamWindowInfo[] = [
  {
    step:       'acquiring_ruq',
    awaitStep:  'awaiting_ruq',
    label:      'Right Upper Quadrant',
    shortLabel: 'RUQ',
    scenarioId: 'ruq',
  },
  {
    step:       'acquiring_luq',
    awaitStep:  'awaiting_luq',
    label:      'Left Upper Quadrant',
    shortLabel: 'LUQ',
    scenarioId: 'luq',
  },
  {
    step:       'acquiring_pelvis',
    awaitStep:  'awaiting_pelvis',
    label:      'Pelvis',
    shortLabel: 'Pelvis',
    scenarioId: 'pelvis',
  },
  {
    step:       'acquiring_cardiac',
    awaitStep:  'awaiting_cardiac',
    label:      'Cardiac (Subcostal)',
    shortLabel: 'Cardiac',
    scenarioId: 'cardiac',
  },
];

// ─── Human-readable labels ────────────────────────────────────────────────────

export const STEP_LABELS: Record<ExamSessionStep, string> = {
  idle:              'Idle',
  ready:             'Ready',
  acquiring_ruq:     'Acquiring RUQ',
  awaiting_ruq:      'Confirm RUQ',
  acquiring_luq:     'Acquiring LUQ',
  awaiting_luq:      'Confirm LUQ',
  acquiring_pelvis:  'Acquiring Pelvis',
  awaiting_pelvis:   'Confirm Pelvis',
  acquiring_cardiac: 'Acquiring Cardiac',
  awaiting_cardiac:  'Confirm Cardiac',
  complete:          'Exam Complete',
};

// ─── State transition tables ──────────────────────────────────────────────────

/** acquiring_* → awaiting_* (called when AI threshold is met) */
export const FREEZE_STEP: Partial<Record<ExamSessionStep, ExamSessionStep>> = {
  acquiring_ruq:     'awaiting_ruq',
  acquiring_luq:     'awaiting_luq',
  acquiring_pelvis:  'awaiting_pelvis',
  acquiring_cardiac: 'awaiting_cardiac',
};

/** awaiting_* → next acquiring_* or complete (called when operator confirms) */
export const CONFIRM_STEP: Partial<Record<ExamSessionStep, ExamSessionStep>> = {
  awaiting_ruq:     'acquiring_luq',
  awaiting_luq:     'acquiring_pelvis',
  awaiting_pelvis:  'acquiring_cardiac',
  awaiting_cardiac: 'complete',
};

/** awaiting_* → back to acquiring_* (called when operator re-acquires) */
export const REACQUIRE_STEP: Partial<Record<ExamSessionStep, ExamSessionStep>> = {
  awaiting_ruq:     'acquiring_ruq',
  awaiting_luq:     'acquiring_luq',
  awaiting_pelvis:  'acquiring_pelvis',
  awaiting_cardiac: 'acquiring_cardiac',
};

// ─── Predicates ───────────────────────────────────────────────────────────────

/** True while inference should be running (not idle/ready/complete/awaiting) */
export function isAcquiringStep(step: ExamSessionStep): boolean {
  return step.startsWith('acquiring_');
}

/** True while awaiting operator confirmation */
export function isAwaitingStep(step: ExamSessionStep): boolean {
  return step.startsWith('awaiting_');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * The EXAM_WINDOWS index (0–3) for any step.
 * Returns -1 for idle / ready / complete.
 */
export function windowIndexForStep(step: ExamSessionStep): number {
  return EXAM_WINDOWS.findIndex(
    w => w.step === step || w.awaitStep === step,
  );
}

/**
 * The mock scenario id that should be pinned during an acquiring step.
 * Returns null for non-acquiring steps.
 */
export function scenarioForStep(step: ExamSessionStep): string | null {
  const w = EXAM_WINDOWS.find(w => w.step === step);
  return w?.scenarioId ?? null;
}
