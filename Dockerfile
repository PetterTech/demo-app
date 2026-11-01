FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
ARG BUILD_COMMIT=""
ARG DEMO_VERSION="1.0.0"
ENV NODE_ENV=production PORT=8080 BUILD_COMMIT=${BUILD_COMMIT} DEMO_VERSION=${DEMO_VERSION}
WORKDIR /app
COPY --chown=node:node server.mjs LICENSE ./
COPY --chown=node:node public ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
