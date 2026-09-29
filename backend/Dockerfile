FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./
COPY docs/openapi.yaml ./docs/openapi.yaml

ENV NODE_ENV=production
EXPOSE 4000

CMD [ "sh", "-c", "bun src/db/migrate.ts && bun src/server.ts" ]