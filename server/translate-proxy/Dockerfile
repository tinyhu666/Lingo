FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY runtime-config.example.json ./runtime-config.example.json

RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "src/server.mjs"]
