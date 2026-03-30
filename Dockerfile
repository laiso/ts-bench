FROM oven/bun:1.2.22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bzip2 \
        ca-certificates \
        curl \
        git \
        gnupg \
        libxcb1 \
        unzip \
        procps \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN npm install -g corepack@0.29.4 && corepack enable
RUN mkdir -p /app/repos/exercism-typescript

CMD ["bash"]
