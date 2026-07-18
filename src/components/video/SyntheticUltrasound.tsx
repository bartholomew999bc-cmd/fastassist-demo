/**
 * FAST-Assist Studio — Synthetic Ultrasound Canvas
 *
 * Renders an animated ultrasound-like grayscale canvas when no real video source
 * is available. Simulates speckle noise, depth gradient, and a probe sweep arc.
 * Used as an automatic fallback when the MP4 cannot be loaded.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/state/store';

interface Props {
  className?: string;
}

export function SyntheticUltrasound({ className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const frameRef  = useRef(0);
  const { setVideoPlaying } = useAppStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const W = canvas.width  = 640;
    const H = canvas.height = 480;

    // Pre-generate a noise buffer
    const noiseData = new Float32Array(W * H);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random();
    }

    setVideoPlaying(true);

    const draw = () => {
      frameRef.current++;
      const t = frameRef.current * 0.012;

      // Clear
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // Draw ultrasound sector / fan shape
      const cx = W / 2;
      const cy = -H * 0.3;
      const r1 = H * 0.42;
      const r2 = H * 1.2;
      const sweep = Math.PI * 0.6;

      // Clip to sector
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r2, Math.PI / 2 - sweep / 2, Math.PI / 2 + sweep / 2);
      ctx.arc(cx, cy, r1, Math.PI / 2 + sweep / 2, Math.PI / 2 - sweep / 2, true);
      ctx.closePath();
      ctx.clip();

      // Background gradient — depth
      const grad = ctx.createRadialGradient(cx, cy, r1, cx, cy, r2);
      grad.addColorStop(0,   'rgba(50,50,55,0.9)');
      grad.addColorStop(0.4, 'rgba(30,30,35,0.85)');
      grad.addColorStop(1,   'rgba(5,5,8,0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Speckle noise with temporal variation
      const imageData = ctx.getImageData(0, 0, W, H);
      const pixels = imageData.data;

      for (let y = 0; y < H; y++) {
        const depth = (y / H);
        const falloff = Math.max(0, 1 - depth * 0.7);

        for (let x = 0; x < W; x++) {
          const idx = y * W + x;
          const ni  = (idx + frameRef.current * 3) % noiseData.length;
          const noise = noiseData[ni];

          // Vary noise with angle from center — simulate scan lines
          const dx = x - cx;
          const dy = y - cy;
          const angle = Math.atan2(dx, dy);
          const scanLine = (Math.sin(angle * 20 + t * 0.5) * 0.5 + 0.5) * 0.3;

          // Organ boundaries — simulate structures
          const r = Math.sqrt(dx * dx + dy * dy);
          const organBrightness =
            // Liver-like bright region (upper right)
            (Math.exp(-((x - W * 0.65) ** 2 / 8000 + (y - H * 0.35) ** 2 / 6000)) * 0.45) +
            // Kidney-like ellipse
            (Math.exp(-((x - W * 0.55) ** 2 / 4000 + (y - H * 0.58) ** 2 / 3000)) * 0.3) +
            // Diaphragm line
            (Math.abs(y - H * 0.3 - Math.sin(x * 0.015) * 8) < 3 ? 0.6 : 0) +
            // A-mode echo line
            (Math.abs(r - (r1 + (r2 - r1) * 0.25)) < 6 ? 0.3 : 0);

          const base = (noise * 0.4 + scanLine + organBrightness) * falloff;
          const clamped = Math.min(255, Math.max(0, base * 255));

          const pixIdx = (y * W + x) * 4;
          pixels[pixIdx]     = clamped * 0.9;        // slight blue tint
          pixels[pixIdx + 1] = clamped * 0.95;
          pixels[pixIdx + 2] = clamped;
          // keep alpha as-is
        }
      }

      ctx.putImageData(imageData, 0, 0);
      ctx.restore();

      // Depth ruler on left edge
      ctx.strokeStyle = 'rgba(20,184,166,0.25)';
      ctx.lineWidth = 1;
      for (let d = 1; d <= 5; d++) {
        const ry = H * 0.15 + (H * 0.7 * d) / 5;
        ctx.beginPath();
        ctx.moveTo(16, ry);
        ctx.lineTo(28, ry);
        ctx.stroke();
        ctx.fillStyle = 'rgba(20,184,166,0.4)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${d * 4}`, 2, ry + 4);
      }

      // Scale bar bottom
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W - 60, H - 24);
      ctx.lineTo(W - 20, H - 24);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText('1cm', W - 52, H - 12);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      setVideoPlaying(false);
    };
  }, [setVideoPlaying]);

  return (
    <canvas
      id="fast-assist-video"
      ref={canvasRef}
      className={`${className} object-contain`}
    />
  );
}
