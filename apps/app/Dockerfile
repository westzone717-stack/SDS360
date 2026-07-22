# Build context must be the monorepo root:
#   docker build -f apps/app/Dockerfile -t sds360-app .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

# ---- deps: install the full workspace graph -----------------------------
# pnpm workspaces resolve `workspace:*` deps against sibling packages, so the
# whole monorepo (not just this app) has to be present for `pnpm install` to
# succeed correctly.
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
# Copy the whole installed tree, not just root + apps/app/node_modules —
# pnpm links each workspace package's own deps (e.g. @sds360/types) into
# that package's own node_modules/ (packages/db/node_modules/, etc.), not
# only at the root. Missing any of those breaks TypeScript module resolution
# inside packages/* during the build.
COPY --from=deps /repo ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sds360/app build

# ---- runner: minimal standalone server ------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/app/public ./public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/app/.next/static ./apps/app/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/app/server.js"]
