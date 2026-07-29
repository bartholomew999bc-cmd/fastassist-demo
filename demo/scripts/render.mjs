/**
 * FAST-Assist Studio — Playwright Frame Renderer
 *
 * Launches Chromium headless, loads presentation.html, and captures
 * every frame by calling window.renderFrame(n) deterministically.
 * Saves PNG frames to demo/frames/frame_NNNNNN.png
 *
 * Usage: node demo/scripts/render.mjs [--start 0] [--end 4499] [--batch 300]
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRAMES_DIR = path.join(ROOT, 'demo', 'frames');
const HTML_PATH = path.join(ROOT, 'demo', 'presentation.html');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 ? parseInt(args[i + 1], 10) : def;
}
const START_FRAME  = argVal('--start', 0);
const END_FRAME    = argVal('--end', -1);   // -1 = all
const BATCH_REPORT = argVal('--batch', 300);

async function main() {
  if (!existsSync(HTML_PATH)) {
    console.error(`ERROR: ${HTML_PATH} not found`);
    process.exit(1);
  }

  await mkdir(FRAMES_DIR, { recursive: true });

  // Locate system Chromium (NixOS: use the Nix-installed binary, not the
  // Playwright-bundled one, which requires Ubuntu/Debian system libs)
  const { execSync } = await import('child_process');
  let chromiumPath;
  try {
    chromiumPath = execSync('which chromium', { encoding: 'utf8' }).trim();
  } catch {
    chromiumPath = undefined;
  }

  console.log(`[render] Launching Chromium… (${chromiumPath || 'bundled'})`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--font-render-hinting=none',
      '--disable-font-subpixel-positioning',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  // Silence console noise
  page.on('pageerror', err => console.error('[page error]', err.message));

  const fileUrl = `file://${HTML_PATH}`;
  console.log(`[render] Loading ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Wait for fonts / paint to settle
  await page.waitForTimeout(500);

  // Discover total frames
  const totalFrames = await page.evaluate(() => window.TOTAL_FRAMES);
  const endFrame = END_FRAME === -1 ? totalFrames - 1 : END_FRAME;

  console.log(`[render] Total frames: ${totalFrames}`);
  console.log(`[render] Rendering frames ${START_FRAME}–${endFrame}`);

  const t0 = Date.now();
  let rendered = 0;
  let scene5Screenshot = null;

  for (let f = START_FRAME; f <= endFrame; f++) {
    // Call the deterministic render function
    const ok = await page.evaluate((frame) => window.renderFrame(frame), f);
    if (!ok) {
      console.log(`[render] renderFrame returned false at frame ${f}, stopping.`);
      break;
    }

    // Capture screenshot
    const imgBuffer = await page.screenshot({ type: 'png' });
    const frameName = `frame_${String(f).padStart(6, '0')}.png`;
    await writeFile(path.join(FRAMES_DIR, frameName), imgBuffer);
    rendered++;

    // Capture Scene 5 screenshot (frame 1800 = ~30s, mid-scene)
    if (f === 1800 && !scene5Screenshot) {
      scene5Screenshot = path.join(ROOT, 'demo', 'scene5_screenshot.png');
      await writeFile(scene5Screenshot, imgBuffer);
      console.log(`[render] Scene 5 screenshot saved → demo/scene5_screenshot.png`);
    }

    if (rendered % BATCH_REPORT === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const fps = rendered / elapsed;
      const remaining = (endFrame - f) / fps;
      console.log(
        `[render] Frame ${f}/${endFrame} | ${rendered} rendered | ${fps.toFixed(1)} fps | ~${remaining.toFixed(0)}s remaining`
      );
    }
  }

  await browser.close();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[render] ✓ Done — ${rendered} frames rendered in ${elapsed}s`);
  console.log(`[render] Frames saved to: ${FRAMES_DIR}`);
}

main().catch(err => {
  console.error('[render] FATAL:', err.message);
  process.exit(1);
});
