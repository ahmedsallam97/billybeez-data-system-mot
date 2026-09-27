FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
ENV DATABASE_URL=file:/app/prisma/dev.db
ENV DATABASE_PROVIDER=sqlite
ENV POSTGRES_DATABASE_URL=postgresql://client_generation:unused@127.0.0.1:5432/client_generation
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/scripts/docker-start.js ./scripts/docker-start.js
RUN mkdir -p /app/prisma /app/storage/employee-files /app/backups && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "scripts/docker-start.js"]
