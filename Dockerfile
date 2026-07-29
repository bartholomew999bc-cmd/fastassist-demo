# FAST-Assist Studio — Production Docker Image
#
# Multi-stage build:
#   1. builder  — Node 20 Alpine: install deps and build static assets
#   2. runtime  — nginx Alpine:   serve the dist/ folder with SPA routing
#
# Usage:
#   docker build \
#     --build-arg VITE_OPENROUTER_API_KEY=your_key_here \
#     -t fast-assist-studio .
#   docker run -p 8080:80 fast-assist-studio
#
# Note: VITE_ variables are inlined at build time by Vite.
# Never pass secrets as runtime environment variables — they are baked into
# the static JS bundle during the build stage.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (layer cached unless package files change)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build-time env args (Vite replaces import.meta.env.* at bundle time)
ARG VITE_OPENROUTER_API_KEY=""
ARG VITE_PROVIDER="hosted"
ARG VITE_INFERENCE_INTERVAL="1200"
ARG VITE_VIDEO_PATH="/videos/ultrasound.mp4"
ARG VITE_THEME="dark"
ARG VITE_DEBUG="false"

ENV VITE_OPENROUTER_API_KEY=$VITE_OPENROUTER_API_KEY \
    VITE_PROVIDER=$VITE_PROVIDER \
    VITE_INFERENCE_INTERVAL=$VITE_INFERENCE_INTERVAL \
    VITE_VIDEO_PATH=$VITE_VIDEO_PATH \
    VITE_THEME=$VITE_THEME \
    VITE_DEBUG=$VITE_DEBUG

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
