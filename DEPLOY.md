# FAST-Assist Studio — Cloud Run Deployment Guide

## Overview

FAST-Assist Studio is a fully static React + TypeScript SPA served by nginx.
The production Docker image uses a multi-stage build (Node 20 builder → nginx 1.27 runtime).
Cloud Run injects `$PORT` at container startup; the entrypoint script substitutes it into the nginx config via `envsubst`.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker | 24+ |
| Google Cloud SDK (`gcloud`) | latest |
| Firebase project | configured |
| Google Cloud project | billing enabled |

---

## Required IAM Roles

| Principal | Role |
|-----------|------|
| Cloud Build service account | `roles/storage.admin`, `roles/artifactregistry.writer` |
| Cloud Run service account | `roles/run.invoker` (for public access) |
| Deploying user / CI | `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser` |

---

## Environment Variables

All `VITE_*` variables are **baked into the static bundle at build time** by Vite.
They are passed as `--build-arg` to `docker build`, not as runtime env vars.

The only runtime environment variable is `PORT`, which Cloud Run injects automatically.

### Required build args

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

### Optional build args

```
VITE_FIREBASE_MEASUREMENT_ID   # Firebase Analytics (optional)
VITE_OPENROUTER_API_KEY        # Required for live AI inference; omit for Mock Mode
VITE_PROVIDER                  # 'hosted' | 'mock'  (default: hosted)
VITE_INFERENCE_INTERVAL        # Frame interval ms  (default: 1200)
VITE_VIDEO_PATH                # Demo video path    (default: /videos/ultrasound.mp4)
VITE_THEME                     # 'dark' | 'light'   (default: dark)
VITE_DEBUG                     # 'true' | 'false'   (default: false)
```

> **Security note:** `VITE_DEV_AUTH_BYPASS` is always forced to `false` in the
> Dockerfile regardless of what is passed. The dev bypass is additionally gated
> on `import.meta.env.DEV` which Vite replaces with `false` in all production
> builds, so the bypass code is dead-code-eliminated from the bundle entirely.

---

## Step-by-step Deployment

### 1. Authenticate

```bash
gcloud auth login
gcloud config set project PROJECT_ID
```

### 2. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### 3. Create Artifact Registry repository (once)

```bash
gcloud artifacts repositories create fast-assist \
  --repository-format=docker \
  --location=us-central1 \
  --description="FAST-Assist Studio container images"
```

### 4. Configure Docker authentication

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 5. Build the container image

```bash
IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/fast-assist/studio:latest

docker build \
  --build-arg VITE_FIREBASE_API_KEY="your_api_key" \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com" \
  --build-arg VITE_FIREBASE_PROJECT_ID="your_project_id" \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET="your_project.firebasestorage.app" \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id" \
  --build-arg VITE_FIREBASE_APP_ID="your_app_id" \
  --build-arg VITE_OPENROUTER_API_KEY="your_openrouter_key" \
  -t $IMAGE \
  .
```

### 6. Push the image

```bash
docker push $IMAGE
```

### 7. Deploy to Cloud Run

```bash
gcloud run deploy fast-assist-studio \
  --image $IMAGE \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 30
```

### 8. Retrieve the service URL

```bash
gcloud run services describe fast-assist-studio \
  --platform managed \
  --region us-central1 \
  --format='value(status.url)'
```

---

## Firebase Authorized Domains

After deployment, add the Cloud Run URL to Firebase Authentication's authorized domains:

1. Open [Firebase Console](https://console.firebase.google.com) → your project
2. Go to **Authentication** → **Settings** → **Authorized domains**
3. Click **Add domain**
4. Add your Cloud Run URL: `fast-assist-studio-xxxx-uc.a.run.app`
5. If using a custom domain, add that too

> Without this step, Google Sign-In will fail with an "unauthorized domain" error.

---

## Custom Domain (optional)

```bash
gcloud run domain-mappings create \
  --service fast-assist-studio \
  --domain app.your-domain.com \
  --region us-central1
```

Then add the domain to Firebase authorized domains (see above).

---

## Local Container Test

Test the production container locally before pushing:

```bash
docker build \
  --build-arg VITE_FIREBASE_API_KEY="..." \
  ... (all args) \
  -t fast-assist-studio:local .

docker run --rm -p 8080:8080 -e PORT=8080 fast-assist-studio:local
```

Open http://localhost:8080 — the login page should appear.

### Health check

```bash
curl http://localhost:8080/healthz
# → ok
```

---

## Cloud Build (CI/CD)

Store secrets in **Secret Manager** and reference them in `cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        docker build \
          --build-arg VITE_FIREBASE_API_KEY=$$FIREBASE_API_KEY \
          --build-arg VITE_FIREBASE_AUTH_DOMAIN=$$FIREBASE_AUTH_DOMAIN \
          --build-arg VITE_FIREBASE_PROJECT_ID=$$FIREBASE_PROJECT_ID \
          --build-arg VITE_FIREBASE_STORAGE_BUCKET=$$FIREBASE_STORAGE_BUCKET \
          --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=$$FIREBASE_MESSAGING_SENDER_ID \
          --build-arg VITE_FIREBASE_APP_ID=$$FIREBASE_APP_ID \
          --build-arg VITE_OPENROUTER_API_KEY=$$OPENROUTER_API_KEY \
          -t $_IMAGE_TAG .
    secretEnv:
      - FIREBASE_API_KEY
      - FIREBASE_AUTH_DOMAIN
      - FIREBASE_PROJECT_ID
      - FIREBASE_STORAGE_BUCKET
      - FIREBASE_MESSAGING_SENDER_ID
      - FIREBASE_APP_ID
      - OPENROUTER_API_KEY

availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/firebase-api-key/versions/latest
      env: FIREBASE_API_KEY
    # ... repeat for each secret
```

---

## Troubleshooting

### Login fails with "auth/unauthorized-domain"
Add the Cloud Run service URL to Firebase authorized domains (see above).

### Container exits immediately
Check that the `docker-entrypoint.sh` has execute permission:
```bash
chmod +x docker-entrypoint.sh
```

### App loads but shows blank screen
Verify all `VITE_FIREBASE_*` build args were passed — missing values produce
an empty Firebase config which prevents auth from initialising.

### AI inference not working
Confirm `VITE_OPENROUTER_API_KEY` was passed at build time. Without it the app
falls back to Mock Mode automatically (this is expected behaviour).

### Port errors
Cloud Run always injects `PORT`. The entrypoint script defaults to `8080` if
`PORT` is absent (useful for local testing without `-e PORT=8080`).
