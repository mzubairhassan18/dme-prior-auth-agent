# syntax=docker/dockerfile:1

# --- build -------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

ENV HUSKY=0
RUN npm install --global pnpm@10.17.1

WORKDIR /app

# Install against the lockfile before copying source so dependency layers cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=dme-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Prisma's native engines need the system OpenSSL libraries; the Node slim
# image ships only its bundled OpenSSL. Without this, Prisma defaults to the
# openssl-1.1.x engine on Debian bookworm and migration can fail at runtime.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# Prisma generate does not connect, but the config requires a datasource URL.
ARG DATABASE_URL="postgresql://postgres:postgres@postgres:5432/dme?schema=public"
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm --filter @dme/shared build \
 && pnpm --filter @dme/api exec prisma generate --config prisma7.config.ts \
 && pnpm --filter @dme/api build

# --- runtime -----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HUSKY=0
RUN npm install --global pnpm@10.17.1

# Prisma's migration/schema engine links against the system OpenSSL.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/api

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Single-instance demo: migrate on boot. Use a dedicated migration job when
# scaling the API horizontally.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy --config prisma7.config.ts && exec node dist/main"]
