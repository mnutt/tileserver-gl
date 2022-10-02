FROM ubuntu:focal AS builder

ENV NODE_ENV="production"

RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get -qq update; \
    apt-get -y --no-install-recommends install \
      ca-certificates \
      wget; \
    wget -qO- https://deb.nodesource.com/setup_16.x | bash; \
    apt-get install -y nodejs; \
    apt-get -y remove wget; \
    apt-get -y --purge autoremove; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*;
  
COPY . /usr/src/app

RUN cd /usr/src/app && npm install --production

FROM ubuntu:focal AS final

ENV \
    NODE_ENV="production" \
    CHOKIDAR_USEPOLLING=1 \
    CHOKIDAR_INTERVAL=500

RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    groupadd -r node; \
    useradd -r -g node node; \
    apt-get -qq update; \
    apt-get -y --no-install-recommends install \
      ca-certificates \
      wget \
      pkg-config \
      xvfb \
      libglfw3-dev \
      libuv1-dev \
      libjpeg-turbo8 \
      libicu66 \
      libcurl4-openssl-dev; \
    wget -qO- https://deb.nodesource.com/setup_16.x | bash; \
    apt-get install -y nodejs; \
    apt-get -y remove wget; \
    apt-get -y --purge autoremove; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*;

COPY --from=builder /usr/src/app /app

VOLUME /data
WORKDIR /data

EXPOSE 80

USER node:node

ENTRYPOINT ["/app/docker-entrypoint.sh"]
