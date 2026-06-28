#!/bin/sh
# docker-entrypoint.sh — provision TLS (if enabled), pick nginx config, start nginx.
set -eu

TPL="/etc/nginx/conf-templates"
log() { printf '[entrypoint] %s\n' "$*" >&2; }

# Write the HSTS snippet consumed by nginx.ssl.conf via "include /etc/nginx/hsts.conf".
# Lives outside conf.d so the main nginx.conf "include conf.d/*.conf" does not parse it.
write_hsts() {
    if [ "${SSL_HSTS:-true}" = "true" ]; then
        printf 'add_header Strict-Transport-Security "max-age=31536000" always;\n' > /etc/nginx/hsts.conf
    else
        : > /etc/nginx/hsts.conf
    fi
}

write_hsts

# --- SSL disabled: plain HTTP (current behavior) ---
if [ "${SSL_ENABLED:-false}" != "true" ]; then
    cp "$TPL/nginx.http.conf" /etc/nginx/conf.d/default.conf
    log "TLS disabled — serving plain HTTP (:80)"
    exec nginx -g 'daemon off;'
fi

case "${SSL_MODE:-selfsigned}" in
    manual|selfsigned)
        provision-cert.sh issue
        cp "$TPL/nginx.ssl.conf" /etc/nginx/conf.d/default.conf
        log "TLS enabled — SSL_MODE=$SSL_MODE"
        exec nginx -g 'daemon off;'
        ;;
    letsencrypt)
        CHALLENGE="${SSL_LE_CHALLENGE:-webroot}"
        # Renewal loop (LE only)
        ( while true; do sleep 43200; provision-cert.sh renew; done ) &
        log "renewal loop started (every 12h)"

        if [ -f /etc/nginx/certs/fullchain.pem ] && \
           openssl x509 -checkend 2592000 -noout -in /etc/nginx/certs/fullchain.pem >/dev/null 2>&1; then
            cp "$TPL/nginx.ssl.conf" /etc/nginx/conf.d/default.conf
            log "TLS enabled — Let's Encrypt (existing cert)"
            exec nginx -g 'daemon off;'
        elif [ "$CHALLENGE" = "dns" ]; then
            provision-cert.sh issue
            cp "$TPL/nginx.ssl.conf" /etc/nginx/conf.d/default.conf
            log "TLS enabled — Let's Encrypt (DNS-01)"
            exec nginx -g 'daemon off;'
        else
            # webroot first-issuance bootstrap: http-only nginx → issue → reload to ssl → stay foreground
            cp "$TPL/nginx.bootstrap.conf" /etc/nginx/conf.d/default.conf
            log "starting nginx (http-only) to serve ACME webroot…"
            nginx -g 'daemon off;' &
            NGINX_PID=$!
            trap 'kill -TERM "$NGINX_PID" 2>/dev/null' TERM INT
            # Wait for the http-only nginx to be ready to serve the ACME webroot
            # before firing the challenge (flat sleep races on slow/throttled hosts).
            i=0
            while [ "$i" -lt 30 ]; do
                wget -q -O- "http://127.0.0.1/" >/dev/null 2>&1 && break
                i=$((i + 1)); sleep 1
            done
            provision-cert.sh issue
            cp "$TPL/nginx.ssl.conf" /etc/nginx/conf.d/default.conf
            nginx -t && nginx -s reload || { log "ERROR: nginx ssl config invalid — container will restart to retry"; exit 1; }
            log "TLS enabled — Let's Encrypt (webroot bootstrap complete)"
            wait "$NGINX_PID"
        fi
        ;;
    *) log "ERROR: unknown SSL_MODE=$SSL_MODE"; exit 2 ;;
esac
