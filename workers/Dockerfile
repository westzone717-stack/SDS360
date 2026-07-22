# Build context must be the monorepo root:
#   docker build -f workers/Dockerfile -t sds360-workers .
#
# No compile step — `pnpm start` runs `tsx src/index.ts` directly, same as
# in dev. This ships full node_modules + source rather than a bundled build;
# fine for a background worker, but worth revisiting (real tsc/esbuild build)
# if image size or cold-start time becomes a problem.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY workers/package.json workers/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker

# See apps/app/Dockerfile — pnpm links each workspace package's own deps into
# that package's own node_modules/, not only at the root.
COPY --from=deps /repo ./
COPY . .

USER worker
CMD ["pnpm", "--filter", "@sds360/workers", "start"]
