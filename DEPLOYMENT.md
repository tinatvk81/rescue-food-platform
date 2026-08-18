# DEPLOYMENT.md — Deploying Rescue Food Platform to Render.com

Render.com is recommended here specifically because its servers are
NOT in Iran — which means outbound connections to MongoDB Atlas (and
any other US-based service) work normally, sidestepping the
Atlas/Docker Hub blocking issues encountered during local development
on an Iranian IP. As a public HTTPS website, it's generally reachable
from Iran the same way most ordinary foreign websites are.

## 1. Set up MongoDB Atlas (real, not local Docker)

1. Create a free cluster at mongodb.com/cloud/atlas (this will work
   now, since Render's servers aren't on an Iranian IP).
2. Database Access → create a user + password.
3. Network Access → Add IP Address → **Allow Access From Anywhere**
   (0.0.0.0/0) — simplest for a first deploy; Render's IPs aren't
   static on free tiers, so a fixed IP allowlist isn't practical here.
4. Connect → Drivers → copy the `mongodb+srv://...` connection string.

## 2. Get a real Zarinpal merchant ID

Sandbox mode (`ZARINPAL_SANDBOX=true`) never moves real money — for an
actual live site accepting real payments, register a merchant account
at zarinpal.com and get an approved `merchant_id`.

## 3. Push the Dockerfile (already created) to your GitHub repo

```bash
git add Dockerfile .dockerignore utils/logger.js app.js
git commit -m "feat: add production deployment config (Docker, winston logging)"
git push
```

## 4. Create the Render Web Service

1. render.com → New → Web Service → connect your GitHub repo.
2. Runtime: **Docker** (Render auto-detects the `Dockerfile`).
3. Instance type: Free (fine for a demo/portfolio project).
4. Add these Environment Variables (Render's dashboard, not a
   committed `.env` file — never commit real secrets):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `MONGO_URI` | your real Atlas connection string |
   | `JWT_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
   | `JWT_EXPIRES_IN` | `7d` |
   | `APP_BASE_URL` | your Render URL, e.g. `https://rescue-food-platform.onrender.com` (fill this in AFTER the first deploy gives you the URL, then redeploy) |
   | `ZARINPAL_MERCHANT_ID` | your real merchant id (or leave blank to keep using the public sandbox) |
   | `ZARINPAL_SANDBOX` | `false` once you have a real merchant id, otherwise `true` |

5. Deploy. Render builds the Docker image and starts the container
   automatically on every push to your main branch going forward.

## 5. Verify

```bash
curl https://YOUR-RENDER-URL.onrender.com/api/v1/health
```

## ⚠️ Known limitation: uploaded documents don't persist

The container's filesystem is ephemeral on Render's free tier —
anything a business uploads via `POST /businesses/:id/documents`
(Step 3, saved to local disk with `multer`) is **lost on every
redeploy or restart**. This is fine for demoing the feature, but
before it matters for real, switch to object storage (e.g. Liara
Object Storage, ArvanCloud Object Storage, or AWS S3) instead of
local disk. Tracked as a follow-up, not fixed in this deployment pass.

## ⚠️ Also confirm before accepting real payments
- Zarinpal amount currency unit (Rial vs Toman) against your real,
  approved merchant account (see README Security Notes)
- The `devOnlyCode` field in `/auth/request-otp` is already
  automatically disabled once `NODE_ENV=production` is set — double
  check by testing it on the live URL.
