# Set up build
FROM node:lts@sha256:4a55308cc855cba1a925d19ae4e45838741dad2fd7bb8949a93b2a0f2ae339e3 AS build

WORKDIR /usr/src

COPY . ./

RUN npm ci --no-optional && \
    npm run compile && \
    rm -rf node_modules .git

FROM ubuntu:rolling@sha256:9279f41cc6e4df8f87b13ac17c2c6f2a280fd3ca2638d18f8dc94b774486909f

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
