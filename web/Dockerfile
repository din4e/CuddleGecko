# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /web

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime ----------
# dist is baked into the image at build time; redeploying the frontend
# requires `docker compose build web`.
FROM nginx:alpine

# TLS tooling: openssl for self-signed, curl to install acme.sh.
RUN apk add --no-cache openssl curl ca-certificates

# acme.sh — Let's Encrypt client (pure shell). Best-effort at build; provision-cert.sh
# re-installs at runtime if missing (offline builds still succeed for self-signed/manual).
RUN curl -fsSL https://get.acme.sh -o /tmp/acme-install.sh \
    && sh /tmp/acme-install.sh --home /root/.acme.sh >/dev/null 2>&1 \
    && /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt >/dev/null 2>&1 \
    && rm -f /tmp/acme-install.sh; true

# Static frontend
COPY --from=builder /web/dist /usr/share/nginx/html

# Configs (one is selected at runtime by the entrypoint) + scripts
COPY conf/ /etc/nginx/conf-templates/
COPY scripts/provision-cert.sh /usr/local/bin/provision-cert.sh
COPY docker-entrypoint.sh      /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/provision-cert.sh /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /var/www/acme /etc/nginx/certs \
    && : > /etc/nginx/hsts.conf   # default empty so nginx -t never fails on a missing include

EXPOSE 80 443

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
