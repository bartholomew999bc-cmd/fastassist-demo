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

## GitHub Actions CI/CD

Every push to `main` automatically builds and deploys via `.github/workflows/deploy.yml`.
Pull requests are checked (type + build) via `.github/workflows/pr-check.yml`.

### Required GitHub Secrets

Add these in **GitHub → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Example value | Notes |
|--------|--------------|-------|
| `GCP_PROJECT_ID` | `my-gcp-project` | Google Cloud project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123.../providers/github-provider` | Full WIF provider resource name |
| `GCP_SERVICE_ACCOUNT` | `github-actions-deploy@my-project.iam.gserviceaccount.com` | SA email for WIF |
| `GCP_REGION` | `us-central1` | Artifact Registry + Cloud Run region |
| `GCP_AR_REPOSITORY` | `fast-assist` | Artifact Registry repository name |
| `CLOUDRUN_SERVICE_NAME` | `fast-assist-studio` | Cloud Run service name |
| `VITE_FIREBASE_API_KEY` | `AIzaSy...` | Firebase project config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `project.firebaseapp.com` | |
| `VITE_FIREBASE_PROJECT_ID` | `project-id` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | `project.firebasestorage.app` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `566469349570` | |
| `VITE_FIREBASE_APP_ID` | `1:566...:web:...` | |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Optional — Analytics |
| `VITE_OPENROUTER_API_KEY` | `sk-or-...` | Optional — omit for Mock Mode |

---

## One-time Google Cloud Setup

Run these commands once before your first deployment. Replace the placeholder values.

```bash
# ── Configuration ────────────────────────────────────────────────────────────
PROJECT_ID=your-gcp-project-id
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
GITHUB_ORG=your-github-org-or-username
GITHUB_REPO=your-repository-name
SA_NAME=github-actions-deploy
POOL_ID=github-pool
PROVIDER_ID=github-provider
REGION=us-central1
AR_REPO=fast-assist
SERVICE_NAME=fast-assist-studio

# ── 1. Enable required APIs ───────────────────────────────────────────────────
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  --project=$PROJECT_ID

# ── 2. Create the CI/CD service account ──────────────────────────────────────
gcloud iam service-accounts create $SA_NAME \
  --display-name="GitHub Actions CI/CD" \
  --project=$PROJECT_ID

# ── 3. Grant required roles to the service account ───────────────────────────

# Deploy and manage Cloud Run services
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --role="roles/run.admin" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Push container images to Artifact Registry
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --role="roles/artifactregistry.writer" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Cloud Run needs to act as the default compute SA during deployment
gcloud iam service-accounts add-iam-policy-binding \
  "$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --project=$PROJECT_ID

# ── 4. Create Workload Identity Pool ─────────────────────────────────────────
gcloud iam workload-identity-pools create $POOL_ID \
  --location=global \
  --display-name="GitHub Actions Pool" \
  --project=$PROJECT_ID

# ── 5. Create OIDC provider (scoped to your repository) ──────────────────────
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
  --workload-identity-pool=$POOL_ID \
  --location=global \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository=='$GITHUB_ORG/$GITHUB_REPO'" \
  --project=$PROJECT_ID

# ── 6. Allow WIF to impersonate the service account ──────────────────────────
gcloud iam service-accounts add-iam-policy-binding \
  "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$GITHUB_ORG/$GITHUB_REPO" \
  --project=$PROJECT_ID

# ── 7. Get the WIF provider resource name → paste into GCP_WORKLOAD_IDENTITY_PROVIDER secret
gcloud iam workload-identity-pools providers describe $PROVIDER_ID \
  --workload-identity-pool=$POOL_ID \
  --location=global \
  --format='value(name)' \
  --project=$PROJECT_ID

# ── 8. Create Artifact Registry repository (if not already done) ──────────────
gcloud artifacts repositories create $AR_REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="FAST-Assist Studio container images" \
  --project=$PROJECT_ID

# ── 9. Create the initial Cloud Run service (first deploy only) ───────────────
# After this, GitHub Actions updates it on every push to main.
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/studio:latest"

gcloud run deploy $SERVICE_NAME \
  --image "$IMAGE" \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 30 \
  --project=$PROJECT_ID
```

> **Tip:** The output of step 7 is the full resource name like
> `projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider`.
> This goes into the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub Secret.

---

## How Deployments Work

```
push to main
     │
     ▼
GitHub Actions (deploy.yml)
     │
     ├─ npm ci + tsc --noEmit          (fast type-check)
     ├─ docker build (VITE_* baked in) (builds the static bundle)
     ├─ docker push :sha + :latest      (to Artifact Registry)
     └─ gcloud run deploy --image :sha  (zero-downtime rollout)
              │
              ▼
        Cloud Run promotes new revision
        Previous revision stays warm until health checks pass
        URL remains constant — no DNS change needed
```

---

## Rollback

Cloud Run keeps all previous revisions. To roll back to any earlier commit:

```bash
# List recent revisions
gcloud run revisions list \
  --service fast-assist-studio \
  --region us-central1 \
  --sort-by='~DEPLOYED' \
  --limit=10

# Send 100% of traffic to a specific revision
gcloud run services update-traffic fast-assist-studio \
  --region us-central1 \
  --to-revisions=fast-assist-studio-00042-xyz=100
```

Or re-run an earlier GitHub Actions workflow run via the **Actions** tab → select the run → **Re-run all jobs**.

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
