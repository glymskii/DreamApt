FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config + all package.json files in one layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/backend/package.json apps/backend/tsconfig.json apps/backend/tsconfig.build.json apps/backend/nest-cli.json ./apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and build in one step
COPY packages/shared/src ./packages/shared/src
COPY apps/backend/src ./apps/backend/src
RUN cd packages/shared && pnpm run build && cd /app/apps/backend && pnpm run build

# Production stage
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile --prod

# Copy built files (JSON data included via resolveJsonModule)
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/apps/backend/dist ./apps/backend/dist

EXPOSE 3003

ENV NODE_ENV=production
ENV PORT=3003

CMD ["node", "apps/backend/dist/apps/backend/src/main.js"]
