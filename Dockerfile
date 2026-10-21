FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
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
