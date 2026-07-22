# Build context must be the monorepo root:
#   docker build -f apps/admin/Dockerfile -t sds360-admin .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

# ---- deps: install the full workspace graph -----------------------------
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY workers/package.json workers/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# ---- builder: compile the Next.js app ------------------------------------
FROM base AS builder
WORKDIR /repo
# See apps/app/Dockerfile — pnpm links each workspace package's own deps into
# that package's own node_modules/, not only at the root.
COPY --from=deps /repo ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# See apps/app/Dockerfile — allowedOrigins is a build-time config, needs the
# ARG present before `next build`, not just a runtime ECS env var.
ARG ALLOWED_ORIGINS=localhost:3001
ENV ALLOWED_ORIGINS=$ALLOWED_ORIGINS
RUN pnpm --filter @sds360/admin build

# ---- runner: minimal standalone server ------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/standalone ./
# See apps/app/Dockerfile — the standalone server resolves public/ relative
# to its own directory (apps/admin/), not the container's cwd.
COPY --from=builder /repo/apps/admin/public ./apps/admin/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs
EXPOSE 3001
ENV PORT=3001
CMD ["node", "apps/admin/server.js"]
