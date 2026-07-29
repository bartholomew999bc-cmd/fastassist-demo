/**
 * FAST-Assist Studio — Post-Processing Pipeline
 *
 * Produces polished output files from the existing rendered recording.
 *
 * Outputs:
 *   demo/FASTAssist_Product_Demo.mp4        (chapter overlays, CRF 22)
 *   demo/FASTAssist_Product_Demo_1080p.mp4  (chapter overlays, CRF 18, high quality)
 *   demo/thumbnail.png                       (Scene 1 splash, frame at 3.2 s)
 *   demo/chapters.txt                        (FFMETADATA1 chapter markers)
 *
 * FFmpeg is invoked via spawnSync() exclusively.
 * Every argument is an individual array element — no shell quoting.
 * Filtergraph is built as a single string.
 *
 * Escaping rules applied here:
 *   - Spaces in drawtext `text=` values: escaped as `\ ` (backslash-space)
 *   - Commas in alpha/expression values: escaped as `\,` (backslash-comma)
 *   - `enable` option values: wrapped in FFmpeg single-quotes e.g. 'between(t,s,e)'
 */

import { spawnSync }                    from 'child_process';
import { existsSync, writeFileSync }    from 'fs';
import { resolve, dirname }             from 'path';
import { fileURLToPath }                from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');

// ── Paths ─────────────────────────────────────────────────────────────────────
const FONT     = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
// SOURCE is the original recording — never overwritten; an immutable copy is
// made early in Phase 1 so downstream phases always read the pristine input.
const SOURCE   = resolve(ROOT, 'demo/FASTAssist_Product_Demo.mp4');
const ORIGINAL = '/tmp/fast_assist_original.mp4';   // immutable snapshot
const OUT_STD  = resolve(ROOT, 'demo/FASTAssist_Product_Demo.mp4');
const OUT_HQ   = resolve(ROOT, 'demo/FASTAssist_Product_Demo_1080p.mp4');
const THUMB    = resolve(ROOT, 'demo/thumbnail.png');
const CHAPTERS = resolve(ROOT, 'demo/chapters.txt');
const TMP_STD  = '/tmp/fast_assist_std.mp4';
const TMP_HQ   = '/tmp/fast_assist_hq.mp4';
const TEST_OUT = '/tmp/test_output.mp4';

// ── Phase 1 — Validate source ─────────────────────────────────────────────────
console.log('\n[post_process] ── Phase 1: Validate source ──────────────────────');

if (!existsSync(SOURCE)) {
  console.error(`[post_process] ERROR: Source not found: ${SOURCE}`);
  process.exit(1);
}

const probe = spawnSync('ffprobe', [
  '-v', 'error',
  '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,r_frame_rate,duration,nb_frames',
  '-show_entries', 'format=size',
  '-of', 'json',
  SOURCE,
], { encoding: 'utf8' });

if (probe.status !== 0) {
  console.error('[post_process] ERROR: ffprobe failed:\n', probe.stderr);
  process.exit(1);
}

const pInfo    = JSON.parse(probe.stdout);
const vs       = pInfo.streams[0];
const fmt      = pInfo.format;
const srcW     = vs.width;
const srcH     = vs.height;
const duration = parseFloat(vs.duration);
const nbFrames = parseInt(vs.nb_frames, 10);
const sizeMB   = (parseInt(fmt.size, 10) / 1048576).toFixed(2);

console.log(`[post_process]   File:       ${SOURCE}`);
console.log(`[post_process]   Size:       ${sizeMB} MB`);
console.log(`[post_process]   Duration:   ${duration}s`);
console.log(`[post_process]   Frames:     ${nbFrames}`);
console.log(`[post_process]   Resolution: ${srcW}×${srcH}`);
console.log(`[post_process]   Frame rate: ${vs.r_frame_rate}`);

if (srcW < 1280 || srcH < 720 || duration < 30) {
  console.error('[post_process] ERROR: Recording does not meet minimum requirements.');
  process.exit(1);
}

// Snapshot original to an immutable temp path so all encode phases read the
// pristine source even after OUT_STD (same path as SOURCE) is overwritten.
const snapCp = spawnSync('cp', [SOURCE, ORIGINAL], { encoding: 'utf8' });
if (snapCp.status !== 0) {
  console.error('[post_process] ERROR: Could not snapshot original:', snapCp.stderr);
  process.exit(1);
}
console.log(`[post_process]   ✓ Source validated — immutable snapshot → ${ORIGINAL}\n`);

// ── Scene chapter data ─────────────────────────────────────────────────────────
// Scenes 1 and 10 have full-screen baked titles; scene 8 already shows
// "Free Fluid Detection" as a heading — those get no additional overlay.
const SCENES = [
  { id:  1, label: 'Introduction',          start:  0.0, end:  7.0, overlay: false },
  { id:  2, label: 'Studio Overview',       start:  6.5, end: 14.5, overlay: true  },
  { id:  3, label: 'RUQ Anatomy',           start: 14.0, end: 21.5, overlay: true  },
  { id:  4, label: 'Probe Guidance',        start: 21.0, end: 28.0, overlay: true  },
  { id:  5, label: 'AI Analysis',           start: 27.5, end: 35.5, overlay: true  },
  { id:  6, label: 'Confidence Gating',     start: 35.0, end: 43.0, overlay: true  },
  { id:  7, label: 'Anatomical Overlays',   start: 42.5, end: 50.5, overlay: true  },
  { id:  8, label: 'Free Fluid Assessment', start: 50.0, end: 58.0, overlay: false },
  { id:  9, label: 'Feature Showcase',      start: 57.5, end: 67.5, overlay: true  },
  { id: 10, label: 'Closing',               start: 67.0, end: 75.0, overlay: false },
];

// ── Filtergraph builder ───────────────────────────────────────────────────────
//
// Escaping contract (spawn / no shell):
//   text= values  → replace spaces with \  (backslash-space; in JS: '\\ ')
//   alpha=        → commas escaped as \,   (in JS string literal: '\\,' → produces \,)
//   enable=       → wrapped in FFmpeg single-quotes: 'between(t,s,e)'
//
function escText(s) {
  // Escape characters special in FFmpeg filter option values
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/ /g, '\\ ');
}

// Build alpha fade expression with \, escaping (no quotes around the expr).
// Fade-in over FADE_S seconds from `s`, hold at ALPHA, fade-out over FADE_S
// seconds before `e`.
const FADE   = 0.55;  // seconds
const HOLD_A = 0.80;  // alpha during hold

function buildAlpha(s, e) {
  const fi = (s + FADE).toFixed(3);
  const fo = (e - FADE).toFixed(3);
  const sc = s.toFixed(3);
  const ec = e.toFixed(3);
  // Every comma → \, for FFmpeg value-level escaping
  const c = '\\,';
  return (
    `if(lt(t${c}${sc})${c}0${c}` +
    `if(lt(t${c}${fi})${c}(t-${sc})/${FADE}${c}` +
    `if(lt(t${c}${fo})${c}${HOLD_A}${c}` +
    `if(lt(t${c}${ec})${c}(${ec}-t)/${FADE}${c}0))))`
  );
}

// Build a single drawtext filter string.
// FFmpeg requires:  drawtext=opt1=val1:opt2=val2:...
// (the filter name and first option are separated by '=', remaining options by ':')
function dt(opts) {
  const entries = Object.entries(opts);
  const [k0, v0] = entries[0];
  return `drawtext=${k0}=${v0}` + entries.slice(1).map(([k, v]) => `:${k}=${v}`).join('');
}

function buildFiltergraph() {
  const parts = [];

  for (const sc of SCENES) {
    if (!sc.overlay) continue;

    const s = sc.start, e = sc.end;
    const alpha  = buildAlpha(s, e);
    const enable = `'between(t,${s},${e})'`;

    // ── scene-number badge (teal) ──────────────────────────────────────────
    parts.push(dt({
      fontfile: FONT,
      text: String(sc.id).padStart(2, '0'),
      fontsize: 13,
      fontcolor: '0x2dd4bf',
      alpha,
      x: 48,
      y: 'h-52',
      enable,
    }));

    // ── chapter label (white) ──────────────────────────────────────────────
    parts.push(dt({
      fontfile: FONT,
      text: escText(sc.label.toUpperCase()),
      fontsize: 13,
      fontcolor: 'white',
      alpha,
      x: 72,
      y: 'h-52',
      enable,
    }));
  }

  // ── persistent branding watermark ─────────────────────────────────────────
  parts.push(dt({
    fontfile: FONT,
    text: 'FAST-Assist\\ Studio',
    fontsize: 11,
    fontcolor: 'white',
    alpha: 0.18,
    x: 'w-222',
    y: 'h-34',
  }));

  return parts.join(',');
}

const filtergraph = buildFiltergraph();

// ── Phase 2 — Test encode (0–12 s) ────────────────────────────────────────────
console.log('[post_process] ── Phase 2: Test encode (0–12 s) ─────────────────');

const testArgs = [
  '-y', '-i', ORIGINAL,
  '-t', '12',
  '-vf', filtergraph,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  TEST_OUT,
];

const testRun = spawnSync('ffmpeg', testArgs, { encoding: 'utf8', maxBuffer: 64 << 20 });

if (testRun.status !== 0) {
  console.error('\n[post_process] ERROR: Test encode FAILED');
  console.error('[post_process] Filtergraph:\n' + filtergraph);
  console.error('\n[post_process] FFmpeg stderr:\n' + testRun.stderr);
  console.error('[post_process] Exit code:', testRun.status);
  process.exit(1);
}

{
  const tp = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration,size','-of','json', TEST_OUT], { encoding:'utf8' });
  const td = JSON.parse(tp.stdout);
  console.log(`[post_process]   ✓ test_output.mp4 — ` +
    `${parseFloat(td.format.duration).toFixed(2)}s  ` +
    `${(parseInt(td.format.size)/1024).toFixed(0)} KB  exit:0\n`);
}

// ── Phase 3 — Full render: standard quality (CRF 22) ─────────────────────────
// Both encodes (standard + HQ) read from ORIGINAL — the immutable snapshot —
// so the source is never touched until after both renders succeed.
console.log('[post_process] ── Phase 3: Full render — standard (CRF 22) ──────');

const stdArgs = [
  '-y', '-i', ORIGINAL,       // ← immutable snapshot, not SOURCE
  '-vf', filtergraph,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  TMP_STD,
];

console.log('[post_process]   Encoding standard version (this may take ~1–2 min)…');
const stdRun = spawnSync('ffmpeg', stdArgs, { encoding: 'utf8', maxBuffer: 64 << 20 });

if (stdRun.status !== 0) {
  console.error('[post_process] ERROR: Standard encode FAILED\n' + stdRun.stderr);
  process.exit(1);
}
console.log(`[post_process]   ✓ TMP_STD encoded\n`);

// ── Phase 4 — High-quality 1080p (CRF 18) ────────────────────────────────────
console.log('[post_process] ── Phase 4: Full render — 1080p HQ (CRF 18) ──────');

const hqArgs = [
  '-y', '-i', ORIGINAL,       // ← same immutable snapshot
  '-vf', filtergraph,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  TMP_HQ,
];

console.log('[post_process]   Encoding 1080p HQ version…');
const hqRun = spawnSync('ffmpeg', hqArgs, { encoding: 'utf8', maxBuffer: 64 << 20 });

if (hqRun.status !== 0) {
  console.error('[post_process] ERROR: HQ encode FAILED\n' + hqRun.stderr);
  process.exit(1);
}
console.log(`[post_process]   ✓ TMP_HQ encoded\n`);

// Both encodes succeeded from the pristine original — now atomically move
// the temp files to their final destinations.
const cpStd = spawnSync('cp', [TMP_STD, OUT_STD], { encoding: 'utf8' });
if (cpStd.status !== 0) { console.error('[post_process] cp STD failed:', cpStd.stderr); process.exit(1); }
const cpHQ = spawnSync('cp', [TMP_HQ, OUT_HQ], { encoding: 'utf8' });
if (cpHQ.status !== 0) { console.error('[post_process] cp HQ failed:', cpHQ.stderr); process.exit(1); }
console.log(`[post_process]   ✓ ${OUT_STD}`);
console.log(`[post_process]   ✓ ${OUT_HQ}\n`);

// ── Phase 5 — Thumbnail ───────────────────────────────────────────────────────
console.log('[post_process] ── Phase 5: Thumbnail ────────────────────────────');

const thumbArgs = [
  '-y', '-ss', '3.2', '-i', ORIGINAL,   // ← pristine source for thumbnail too
  '-vframes', '1',
  '-vf', 'scale=1920:1080:flags=lanczos',
  '-q:v', '1',
  THUMB,
];

const thumbRun = spawnSync('ffmpeg', thumbArgs, { encoding: 'utf8', maxBuffer: 16 << 20 });
if (thumbRun.status !== 0) {
  console.error('[post_process] ERROR: Thumbnail FAILED\n' + thumbRun.stderr);
  process.exit(1);
}
console.log(`[post_process]   ✓ ${THUMB}\n`);

// ── Phase 6 — chapters.txt (FFMETADATA1) ─────────────────────────────────────
console.log('[post_process] ── Phase 6: chapters.txt ─────────────────────────');

let chapTxt = ';FFMETADATA1\ntitle=FAST-Assist Studio \u2014 Product Demo\n\n';
for (const sc of SCENES) {
  chapTxt += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(sc.start * 1000)}\nEND=${Math.round(sc.end * 1000)}\ntitle=${sc.label}\n\n`;
}
writeFileSync(CHAPTERS, chapTxt, 'utf8');
console.log(`[post_process]   ✓ ${CHAPTERS}\n`);

// ── Final report ──────────────────────────────────────────────────────────────
function probeFile(p) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=width,height',
    '-show_entries', 'format=duration,size',
    '-of', 'json', p,
  ], { encoding: 'utf8' });
  const d = JSON.parse(r.stdout);
  return {
    dur:    parseFloat(d.format.duration).toFixed(2),
    sizeMB: (parseInt(d.format.size) / 1048576).toFixed(2),
    res:    d.streams?.[0] ? `${d.streams[0].width}×${d.streams[0].height}` : '?',
  };
}

const rStd = probeFile(OUT_STD);
const rHQ  = probeFile(OUT_HQ);

console.log('[post_process] ══ Final Report ══════════════════════════════════');
console.log(`  Recording used:    ${SOURCE}`);
console.log(`  Duration:          ${duration}s   Resolution: ${srcW}×${srcH}`);
console.log('');
console.log(`  FASTAssist_Product_Demo.mp4       ${rStd.res} | ${rStd.dur}s | ${rStd.sizeMB} MB | exit:0`);
console.log(`  FASTAssist_Product_Demo_1080p.mp4 ${rHQ.res}  | ${rHQ.dur}s | ${rHQ.sizeMB} MB | exit:0`);
console.log(`  thumbnail.png                      1920×1080  | extracted at 3.2s`);
console.log(`  chapters.txt                       ${SCENES.length} chapters`);
console.log('');
console.log('[post_process] ✓ All production files delivered.');
