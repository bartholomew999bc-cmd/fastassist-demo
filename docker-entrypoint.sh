#!/bin/sh
# FAST-Assist Studio — Container Entrypoint
#
# Cloud Run injects $PORT at runtime. nginx does not read environment variables
# natively, so we use envsubst to write the final config before nginx starts.
#
# Only ${PORT} is substituted — all other nginx $variables are left untouched.
#
# Services started:
#   1. Node.js inference proxy  — 127.0.0.1:9001  (background)
#   2. nginx                    — 0.0.0.0:${PORT} (foreground, PID 1)

set -e

PORT="${PORT:-8080}"
export PORT

# Substitute ${PORT} in the nginx config template and write the live config.
envsubst '${PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "[entrypoint] nginx will listen on port ${PORT}"

# ── Start the inference proxy in the background ───────────────────────────────
# The bundled Node.js server exposes /api/inference on 127.0.0.1:9001.
# nginx reverse-proxies that path to this process.
echo "[entrypoint] starting inference proxy on 127.0.0.1:9001"
node /app/dist-proxy.cjs &

# Give the proxy a moment to bind before nginx starts accepting requests.
sleep 0.5

echo "[entrypoint] starting nginx"

# Replace this shell process with nginx (PID 1).
# SIGTERM sent by Cloud Run's graceful shutdown will reach nginx directly.
exec nginx -g 'daemon off;'
