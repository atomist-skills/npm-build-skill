FROM ubuntu:focal

# tools
RUN apt-get update && apt-get install -y \
        curl \
        wget \
        gnupg \
        build-essential \
        && rm -rf /var/lib/apt/lists/*

# nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> "$HOME/.bashrc" \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm' >> "$HOME/.bashrc"

# nodejs and tools
RUN bash -c "source $HOME/.nvm/nvm.sh \
    && nvm install 10 \
    && nvm install 12 \
    && nvm install 14 \
    && nvm use --lts"

WORKDIR "/skill"

COPY package.json package-lock.json ./

RUN bash -c "source $HOME/.nvm/nvm.sh \
    && npm ci --no-optional \
    && npm cache clean --force"

COPY . ./

WORKDIR "/atm/home"

ENTRYPOINT ["node", "--no-deprecation", "--trace-warnings", "--expose_gc", "--optimize_for_size", "--always_compact", "--max_old_space_size=512", "/skill/node_modules/.bin/atm-skill"]
CMD ["run"]
