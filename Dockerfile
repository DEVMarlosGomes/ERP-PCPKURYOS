# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.17.0-alpine3.23
ARG CADDY_IMAGE=caddy:2.10.2-alpine

FROM ${NODE_IMAGE} AS crm-build
WORKDIR /workspace
COPY crm-frontend/package.json crm-frontend/package-lock.json ./crm-frontend/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix crm-frontend --no-audit --no-fund
COPY crm-frontend ./crm-frontend
RUN npm run build --prefix crm-frontend -- --assetsDir static/crm
COPY public ./public
COPY scripts/integrar-crm-build.mjs ./scripts/integrar-crm-build.mjs
RUN node scripts/integrar-crm-build.mjs crm-frontend/build

FROM ${CADDY_IMAGE} AS web
COPY deploy/hostinger/Caddyfile /etc/caddy/Caddyfile
COPY --from=crm-build /workspace/public /srv/public
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

FROM ${NODE_IMAGE} AS functions
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY functions/package.json functions/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund
COPY functions ./
COPY scripts/hostinger/backup-firebase.js ./ops/backup-firebase.js
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "render-server.js"]

