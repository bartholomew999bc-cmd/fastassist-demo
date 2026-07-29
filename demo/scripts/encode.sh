#!/usr/bin/env bash
# FAST-Assist Studio — FFmpeg Encoder
# Encodes PNG frame sequence → H.264 MP4 at 60 fps, 1920×1080
# Usage: bash demo/scripts/encode.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRAMES_DIR="$ROOT/demo/frames"
OUTPUT="$ROOT/demo/FASTAssist_Product_Demo.mp4"

if [ ! -d "$FRAMES_DIR" ]; then
  echo "ERROR: Frames directory not found: $FRAMES_DIR" >&2
  exit 1
fi

FRAME_COUNT=$(ls "$FRAMES_DIR"/frame_*.png 2>/dev/null | wc -l)
if [ "$FRAME_COUNT" -eq 0 ]; then
  echo "ERROR: No frames found in $FRAMES_DIR" >&2
  exit 1
fi

echo "[encode] Found $FRAME_COUNT frames"
echo "[encode] Output: $OUTPUT"
echo "[encode] Encoding…"

ffmpeg -y \
  -framerate 60 \
  -i "$FRAMES_DIR/frame_%06d.png" \
  -c:v libx264 \
  -preset slow \
  -crf 18 \
  -pix_fmt yuv420p \
  -vf "scale=1920:1080:flags=lanczos" \
  -movflags +faststart \
  -an \
  "$OUTPUT"

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT" 2>/dev/null || echo "unknown")
SIZE=$(du -sh "$OUTPUT" | cut -f1)

echo ""
echo "[encode] ✓ Complete"
echo "[encode] Output:   $OUTPUT"
echo "[encode] Duration: ${DURATION}s"
echo "[encode] Size:     $SIZE"
