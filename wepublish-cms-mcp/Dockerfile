# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# deps first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# sources needed for codegen (prebuild) + tsc
COPY tsconfig.json codegen.ts ./
COPY schema ./schema
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=build /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# OpenShift compatibility: fixed non-root UID 1001, GID 0, group=user bits.
RUN chown -R 1001:0 /app && chmod -R g=u /app
USER 1001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/healthz || exit 1

# Admin diagnostics → HTTP transport (requires MCP_AUTH_TOKEN). For stdio use, run
# `node dist/index.js` instead.
CMD ["node", "dist/http.js"]
