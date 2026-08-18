# Dockerfile
# ----------
# Multi-stage-free, simple production image. Render.com (and most
# PaaS platforms) can build directly from this without any extra
# configuration.

FROM node:18-alpine

WORKDIR /app

# Copy only the manifest files first so `npm ci` is cached by Docker
# as long as dependencies haven't changed — much faster rebuilds when
# you only change application code.
COPY package*.json ./

# --omit=dev: production images don't need devDependencies (nodemon, etc.)
RUN npm ci --omit=dev

COPY . .

# Documents uploaded via multer (Step 3) currently write to this local
# folder. IMPORTANT: on most PaaS free tiers, the container filesystem
# is EPHEMERAL — anything written here is lost on every redeploy or
# restart. This is fine for demoing, but before real business
# documents matter, switch to object storage (S3-compatible — e.g.
# Liara Object Storage or ArvanCloud Object Storage) instead of local
# disk. Tracked as a known limitation, not fixed in this pass.
RUN mkdir -p public/uploads/business-documents

EXPOSE 3000

CMD ["node", "server.js"]
