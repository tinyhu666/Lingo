FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY runtime-config.example.json ./runtime-config.example.json

RUN groupadd --system --gid 1001 lingo \
    && useradd --system --uid 1001 --gid lingo --no-create-home --shell /usr/sbin/nologin lingo \
    && mkdir -p /app/data \
    && chown -R lingo:lingo /app

USER lingo

ENV NODE_ENV=production
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.mjs"]
