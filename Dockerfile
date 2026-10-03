FROM node:20-bookworm-slim
ARG XRAY_VERSION=26.9.8
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip nginx && rm -rf /var/lib/apt/lists/* && arch="$(dpkg --print-architecture)" && case "$arch" in amd64) asset="Xray-linux-64.zip";; arm64) asset="Xray-linux-arm64-v8a.zip";; *) echo "Unsupported architecture $arch"; exit 1;; esac && curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/${asset}" -o /tmp/xray.zip && mkdir -p /opt/xray && unzip -q /tmp/xray.zip xray geoip.dat geosite.dat -d /opt/xray && chmod +x /opt/xray/xray && rm /tmp/xray.zip
WORKDIR /app
COPY package.json server.js nginx.conf start.sh ./
COPY public ./public
RUN mkdir -p /app/data /app/runtime
ENV PORT=8080 PANEL_PORT=3000
EXPOSE 8080
CMD ["node","/app/server.js"]
