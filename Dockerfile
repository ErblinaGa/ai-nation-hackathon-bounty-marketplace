# Lightning Bounty Marketplace — multi-stage Dockerfile
# For Fly.io, Render, or self-hosted Docker deployments.
# Railway users: use nixpacks.toml instead (automatic, no Dockerfile needed).

# ============================================================================
# Stage 1: builder — installs all deps, builds Next.js + CLI
# ============================================================================
FROM node:22-bookworm-slim AS builder

# Install system deps needed at build time and for runtime (git, patch, python3, openssl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    patch \
    python3 \
    python3-pip \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy CLI and build it
COPY cli/ ./cli/
RUN cd cli && npm ci && npm run build

# Copy everything else and build Next.js
COPY . .
RUN npm run build

# ============================================================================
# Stage 2: runner — minimal image with only what's needed at runtime
# ============================================================================
FROM node:22-bookworm-slim AS runner

# Install runtime system deps (sandbox requires git, patch, python3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    patch \
    python3 \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built artifacts from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/cli/dist ./cli/dist
COPY --from=builder /app/cli/node_modules ./cli/node_modules
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public 2>/dev/null || true

# Make startup script executable
RUN chmod +x scripts/start.sh

EXPOSE 3000

CMD ["bash", "scripts/start.sh"]
