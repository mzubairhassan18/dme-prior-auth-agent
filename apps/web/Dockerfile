# syntax=docker/dockerfile:1

# --- build -------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

ENV HUSKY=0
RUN npm install --global pnpm@10.17.1

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=dme-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_* values are inlined by Next at build time.
ARG NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
ARG NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

RUN pnpm --filter @dme/shared build \
 && pnpm --filter @dme/web build

# --- runtime -----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HUSKY=0
RUN npm install --global pnpm@10.17.1

WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
