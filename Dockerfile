FROM node:20-slim AS base

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy package.json files for all workspaces
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/backend/package.json apps/backend/tsconfig.json apps/backend/tsconfig.build.json apps/backend/nest-cli.json ./apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/src ./packages/shared/src
COPY apps/backend/src ./apps/backend/src

# Build shared package
RUN cd packages/shared && pnpm run build

# Build backend
RUN cd apps/backend && pnpm run build

# Production stage
FROM node:20-slim AS production

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/src ./packages/shared/src
COPY --from=base /app/apps/backend/dist ./apps/backend/dist

# Copy JSON data files needed at runtime
COPY packages/shared/src/constants/*.json ./packages/shared/src/constants/

EXPOSE 3003

ENV NODE_ENV=production
ENV PORT=3003

CMD ["node", "apps/backend/dist/apps/backend/src/main.js"]
