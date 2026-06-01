# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY mailguardpro-web/package.json ./mailguardpro-web/
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm exec prisma generate
RUN pnpm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/mailguardpro-web/.next ./mailguardpro-web/.next
COPY --from=builder /app/mailguardpro-web/public ./mailguardpro-web/public
COPY --from=builder /app/mailguardpro-web/package.json ./mailguardpro-web/
COPY --from=builder /app/pnpm-lock.yaml ./
RUN addgroup --system --gid 1001 mailguard && \
    adduser --system --uid 1001 --ingroup mailguard mailguard && \
    chown -R mailguard:mailguard /app
USER mailguard
EXPOSE 3000
CMD ["pnpm", "start"]
