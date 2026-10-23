FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
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
