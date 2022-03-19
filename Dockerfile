# Set up build
FROM node:lts@sha256:ca9d3abb9e2228bf849afad8f861e0b446fd62d9f8ba85385e18f31f20cb58b8 AS build

WORKDIR /usr/src

COPY . ./

RUN npm ci --no-optional && \
    npm run compile && \
    rm -rf node_modules .git

FROM ubuntu:rolling@sha256:02c0317b899ca5595fa17870cedd9550962dbdb2e0b55def018727527b57e2f4

# Fix CVE-2021-26932, CVE-2021-3520
RUN apt-get update && apt-get install -y \
    liblz4-1=1.9.3-1ubuntu0.1 \
    linux-libc-dev=5.11.0-18.19 \
 && apt-get clean -y \
 && rm -rf /var/cache/apt /var/lib/apt/lists/* /tmp/* /var/tmp/*

# tools
RUN apt-get update && apt-get install -y \
    build-essential=12.8ubuntu3 \
    curl=7.74.0-1ubuntu2 \
    git=1:2.30.2-1ubuntu1 \
    gnupg=2.2.20-1ubuntu3 \
    wget=1.21-1ubuntu3 \
 && apt-get clean -y \
 && rm -rf /var/cache/apt /var/lib/apt/lists/* /tmp/* /var/tmp/*

# nvm
ENV NVM_DIR /opt/.nvm
RUN mkdir -p /opt/.nvm && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
RUN echo 'export NVM_DIR="/opt/.nvm"' >> "$HOME/.bashrc" \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm' >> "$HOME/.bashrc"

# nodejs and tools
RUN bash -c "source /opt/.nvm/nvm.sh \
    && nvm install 14 \
    && nvm use --lts \
    && nvm alias default node"

WORKDIR "/skill"

COPY package.json package-lock.json ./

RUN bash -c "source /opt/.nvm/nvm.sh \
    && npm ci --no-optional \
    && npm cache clean --force"

COPY --from=build /usr/src/ .

WORKDIR "/atm/home"

ENTRYPOINT ["bash", "-c", "source /opt/.nvm/nvm.sh && node --no-deprecation --trace-warnings --expose_gc --optimize_for_size --always_compact --max_old_space_size=512 /skill/node_modules/.bin/atm-skill run"]
