FROM node:10-buster AS builder

RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get -qq update \
  && apt-get -y --no-install-recommends install \
      apt-transport-https \
      curl \
      unzip \
      build-essential \
      python \
      libcairo2-dev \
      libgles2-mesa-dev \
      libgbm-dev \
      libllvm7 \
      libprotobuf-dev \
  && apt-get -y --purge autoremove \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir /usr/src/app
COPY ./package.json /usr/src/app
COPY ./yarn.lock /usr/src/app

ENV NODE_ENV="production"

RUN cd /usr/src/app && yarn install --production


FROM node:10-buster-slim AS final

RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get -qq update \
  && apt-get -y --no-install-recommends install \
      libgles2-mesa \
      libegl1 \
      xvfb \
      xauth \
  && apt-get -y --purge autoremove \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY . /app
COPY --from=builder /usr/src/app/node_modules /app/node_modules

ENV PORT=8080
ENV BIND=0.0.0.0

ENV NODE_ENV="production"
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=500

VOLUME /data
WORKDIR /data

RUN chown node:node /data

EXPOSE 8080

USER node:node

ENTRYPOINT ["/app/docker-entrypoint.sh"]
