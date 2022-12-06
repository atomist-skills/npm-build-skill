# Set up build
FROM node:lts@sha256:2a4280571bdae235b0c455b672fc37bde4af599ec4def8b871069e9db98315ea AS build

WORKDIR /usr/src

COPY . ./

RUN npm ci --no-optional && \
    npm run compile && \
    rm -rf node_modules .git

FROM ubuntu:rolling@sha256:edc5125bd9443ab5d5c92096cf0e481f5e8cb12db9f5461ab1ab7a936c7f7d30

# tools
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    gnupg \
    wget \
 && apt-get clean -y \
 && rm -rf /var/cache/apt /var/lib/apt/lists/* /tmp/* /var/tmp/*

# nvm
ENV NVM_DIR /opt/.nvm
RUN mkdir -p /opt/.nvm && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
RUN echo 'export NVM_DIR="/opt/.nvm"' >> "$HOME/.bashrc" \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm' >> "$HOME/.bashrc"

# nodejs and tools
RUN bash -c "source /opt/.nvm/nvm.sh \
    && nvm install 12 \
    && nvm install 14 \
    && nvm install 16 \
    && nvm install 18 \
    && nvm use --lts \
    && nvm alias default node"

WORKDIR "/skill"

COPY package.json package-lock.json ./

RUN bash -c "source /opt/.nvm/nvm.sh \
    && npm ci --no-optional \
    && npm cache clean --force"

COPY --from=build /usr/src/ .

ENTRYPOINT ["bash", "-c", "source /opt/.nvm/nvm.sh && node --no-deprecation --trace-warnings --expose_gc --optimize_for_size --max_old_space_size=512 /skill/node_modules/.bin/atm-skill run"]
