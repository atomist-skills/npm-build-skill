# Set up build
FROM node:lts@sha256:61b6cc81ecc3f94f614dca6bfdc5262d15a6618f7aabfbfc6f9f05c935ee753c AS build

WORKDIR /usr/src

COPY . ./

RUN npm ci --no-optional && \
    npm run compile && \
    rm -rf node_modules .git

FROM ubuntu:rolling@sha256:1108598c6469492b0ec61c4c9bab6868a3d335ecf76deb4d31ff3b2615170ae9

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
