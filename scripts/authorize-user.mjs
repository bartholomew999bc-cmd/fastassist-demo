#!/usr/bin/env node
/**
 * FAST-Assist Studio — Authorize User CLI
 *
 * Inserts (or overwrites) an authorized_users document in Firestore,
 * granting the specified Firebase UID access to FAST-Assist Studio.
 *
 * Usage:
 *   npm run authorize-user -- <firebase_uid> <email> <display_name> [role]
 *
 * Arguments:
 *   firebase_uid   — Firebase UID (find in Firebase Console → Authentication)
 *   email          — User's email address (stored for reference only)
 *   display_name   — User's display name (stored for reference only)
 *   role           — Optional role: admin | operator | viewer (default: operator)
 *
 * Examples:
 *   npm run authorize-user -- abc123uid user@example.com "Alice Smith"
 *   npm run authorize-user -- abc123uid user@example.com "Alice Smith" admin
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS set to a service account JSON file, OR
 *   - Running in a GCP environment with Application Default Credentials (ADC).
 *   - firebase-admin installed (npm install firebase-admin).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const VALID_ROLES = new Set(['admin', 'operator', 'viewer']);

// ── Parse arguments ───────────────────────────────────────────────────────────

const [, , uid, email, displayName, roleArg] = process.argv;

if (!uid || !email || !displayName) {
  console.error(
    '\nUsage: npm run authorize-user -- <firebase_uid> <email> <display_name> [role]\n\n' +
    'Arguments:\n' +
    '  firebase_uid   Firebase UID from the Firebase Console\n' +
    '  email          User email address\n' +
    '  display_name   User display name (quote multi-word names)\n' +
    '  role           admin | operator | viewer  (default: operator)\n\n' +
    'Example:\n' +
    '  npm run authorize-user -- abc123 alice@example.com "Alice Smith"\n' +
    '  npm run authorize-user -- abc123 alice@example.com "Alice Smith" admin\n',
  );
  process.exit(1);
}

const role = roleArg ?? 'operator';
if (!VALID_ROLES.has(role)) {
  console.error(`\nInvalid role "${role}". Must be one of: admin, operator, viewer\n`);
  process.exit(1);
}

// ── Firebase Admin init ───────────────────────────────────────────────────────

const app = getApps().length > 0 ? getApps()[0] : initializeApp();
const db  = getFirestore(app);

// ── Write document ────────────────────────────────────────────────────────────

const docRef = db.collection('authorized_users').doc(uid);

await docRef.set({
  email,
  displayName,
  role,
  enabled:   true,
  createdAt: Timestamp.now(),
});

console.log(
  `\n✓ Authorised user written to Firestore:\n` +
  `    UID:         ${uid}\n` +
  `    Email:       ${email}\n` +
  `    Name:        ${displayName}\n` +
  `    Role:        ${role}\n` +
  `    Enabled:     true\n` +
  `    Collection:  authorized_users/${uid}\n`,
);

process.exit(0);
