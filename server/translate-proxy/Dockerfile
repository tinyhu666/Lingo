FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY runtime-config.example.json ./runtime-config.example.json
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "src/server.mjs"]
