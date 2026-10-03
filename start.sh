#!/bin/sh
set -eu
mkdir -p /app/data /app/runtime
printf '%s\n' '--- startup ---'
sha256sum /app/server.js
node --check /app/server.js
node /app/server.js &
NODE=$!
trap 'kill "$NODE" 2>/dev/null || true' INT TERM EXIT
sleep 1
kill -0 "$NODE" 2>/dev/null || { echo 'Node panel failed'; exit 1; }
/opt/xray/xray run -test -config /app/runtime/xray.json
nginx -t -c /app/nginx.conf
nginx -c /app/nginx.conf -g 'daemon off;' &
NGINX=$!
/opt/xray/xray run -config /app/runtime/xray.json &
XRAY=$!
trap 'kill "$XRAY" "$NGINX" "$NODE" 2>/dev/null || true' INT TERM EXIT
while kill -0 "$NODE" 2>/dev/null && kill -0 "$NGINX" 2>/dev/null && kill -0 "$XRAY" 2>/dev/null; do sleep 2; done
exit 1
