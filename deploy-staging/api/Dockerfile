# Marketing Planner staging API — multi-stage build.
#
# Build stage compiles TypeScript -> dist/. Runtime stage ships only node_modules
# (production deps) + dist + package.json. Image stays small and the runtime
# user is non-root.

FROM node:22-alpine AS build
WORKDIR /app

# Cache deps separately from sources.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist

USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
