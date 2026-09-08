FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=4319 MUNKA_DB=/data/munka.sqlite
EXPOSE 4319
VOLUME /data
CMD ["node", "server.mjs"]
