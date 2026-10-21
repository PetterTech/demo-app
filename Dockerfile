FROM node:24-alpine@sha256:6a1c190e17215d844926b0677f4bf87273ff7d5e54db06d3b5b5863ab0b09a3d
ARG BUILD_COMMIT=""
ARG DEMO_VERSION="1.0.0"
ENV NODE_ENV=production PORT=80 BUILD_COMMIT=${BUILD_COMMIT} DEMO_VERSION=${DEMO_VERSION}
WORKDIR /app
COPY --chown=node:node server.mjs LICENSE ./
COPY --chown=node:node public ./public
USER node
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
