FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY app ./app
COPY lib ./lib
COPY public ./public
COPY prisma ./prisma
COPY scripts ./scripts
COPY next.config.js jsconfig.json ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_DEPLOYMENT_STAGE=pilot
ENV DATABASE_PROVIDER=sqlite
ENV DATABASE_URL=file:/tmp/build-only.db
ENV POSTGRES_DATABASE_URL=postgresql://generation:unused@127.0.0.1:5432/generation
RUN npm run db:clients && npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
ARG RELEASE_REVISION=unrecorded
ENV RELEASE_REVISION=$RELEASE_REVISION
LABEL org.opencontainers.image.revision=$RELEASE_REVISION
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/generated ./generated
COPY --from=builder --chown=node:node /app/next.config.js ./next.config.js
COPY --from=builder --chown=node:node /app/scripts/pilot-backup.js ./scripts/pilot-backup.js
COPY --from=builder --chown=node:node /app/scripts/performance-worker.js ./scripts/performance-worker.js
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --chown=node:node deploy/pilot ./deploy/pilot
USER node
EXPOSE 3000
CMD ["node", "deploy/pilot/start.cjs"]
