#!/bin/sh
# FAST-Assist Studio — Container Entrypoint
#
# Cloud Run injects $PORT at runtime. nginx does not read environment variables
# natively, so we use envsubst to write the final config before nginx starts.
#
# Only ${PORT} is substituted — all other nginx $variables are left untouched.

set -e

PORT="${PORT:-8080}"
export PORT

# Substitute ${PORT} in the nginx config template and write the live config.
envsubst '${PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "[entrypoint] nginx will listen on port ${PORT}"

# Replace this shell process with nginx (PID 1).
# SIGTERM sent by Cloud Run's graceful shutdown will reach nginx directly.
exec nginx -g 'daemon off;'
