#!/bin/sh
# provision-cert.sh — issue / validate / renew TLS certs for the web (nginx) container.
# Driven by SSL_* env vars. Idempotent. POSIX sh (busybox ash on alpine).
set -eu

CERT_DIR="${SSL_CERT_DIR:-/etc/nginx/certs}"
ACME_WEBROOT="${SSL_ACME_WEBROOT:-/var/www/acme}"
ACME_HOME="${ACME_HOME:-/root/.acme.sh}"
ACME_BIN="$ACME_HOME/acme.sh"

DOMAIN="${SSL_DOMAIN:-}"
EXTRA_DOMAINS="${SSL_EXTRA_DOMAINS:-}"
EMAIL="${SSL_EMAIL:-}"
MODE="${SSL_MODE:-selfsigned}"
CHALLENGE="${SSL_LE_CHALLENGE:-webroot}"
DNS_PROVIDER="${SSL_LE_DNS_PROVIDER:-}"
USE_CA="${SSL_USE_CA:-false}"
STAGING="${SSL_LE_STAGING:-false}"

FULLCHAIN="$CERT_DIR/fullchain.pem"
PRIVKEY="$CERT_DIR/privkey.pem"
CA_CERT="$CERT_DIR/ca.crt"
CA_KEY="$CERT_DIR/ca.key"

mkdir -p "$CERT_DIR" "$ACME_WEBROOT"

log() { printf '[provision-cert] %s\n' "$*" >&2; }

# Print "-d name" args for DOMAIN + each comma-separated EXTRA_DOMAINS entry.
domain_args() {
    [ -n "$DOMAIN" ] || { log "ERROR: SSL_DOMAIN is required"; exit 2; }
    printf -- '-d %s\n' "$DOMAIN"
    if [ -n "$EXTRA_DOMAINS" ]; then
        OLDIFS="$IFS"; IFS=','
        for d in $EXTRA_DOMAINS; do
            d="$(printf '%s' "$d" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            [ -n "$d" ] && printf -- '-d %s\n' "$d"
        done
        IFS="$OLDIFS"
    fi
}

# Build the subjectAltName string for self-signed certs (sets global $SAN).
build_san() {
    SAN="DNS:$DOMAIN"
    if [ -n "$EXTRA_DOMAINS" ]; then
        OLDIFS="$IFS"; IFS=','
        for d in $EXTRA_DOMAINS; do
            d="$(printf '%s' "$d" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            [ -z "$d" ] && continue
            case "$d" in
                *[0-9].*[0-9].*[0-9].*[0-9]) SAN="$SAN,IP:$d" ;;
                *) SAN="$SAN,DNS:$d" ;;
            esac
        done
        IFS="$OLDIFS"
    fi
}

# --- selfsigned ---
do_selfsigned() {
    if [ -f "$FULLCHAIN" ] && [ -f "$PRIVKEY" ] && \
       openssl x509 -checkend 2592000 -noout -in "$FULLCHAIN" >/dev/null 2>&1 && \
       { [ "$USE_CA" != "true" ] || [ -f "$CA_CERT" ]; }; then
        log "selfsigned cert present and valid (>30d), skipping"
        return 0
    fi
    build_san

    if [ "$USE_CA" = "true" ]; then
        rm -f /tmp/server.csr /tmp/server.crt /tmp/v3.ext   # sweep stale files from a prior crashed run
        if [ ! -f "$CA_CERT" ] || [ ! -f "$CA_KEY" ]; then
            log "generating local root CA"
            openssl genrsa -out "$CA_KEY" 4096 2>/dev/null
            openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 \
                -subj "/CN=CuddleGecko Local Root CA" -out "$CA_CERT" 2>/dev/null
            chmod 0600 "$CA_KEY"
        fi
        log "signing server cert with local CA (SAN: $SAN)"
        openssl genrsa -out "$PRIVKEY" 2048 2>/dev/null
        chmod 0600 "$PRIVKEY"
        openssl req -new -key "$PRIVKEY" -subj "/CN=$DOMAIN" -out /tmp/server.csr 2>/dev/null
        cat > /tmp/v3.ext <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
EOF
        openssl x509 -req -in /tmp/server.csr -CA "$CA_CERT" -CAkey "$CA_KEY" \
            -CAcreateserial -out /tmp/server.crt -days 825 -sha256 -extfile /tmp/v3.ext 2>/dev/null
        cat /tmp/server.crt > "$FULLCHAIN"
    else
        log "generating self-signed server cert (SAN: $SAN)"
        openssl req -x509 -newkey rsa:2048 -nodes -keyout "$PRIVKEY" \
            -out "$FULLCHAIN" -days 825 -subj "/CN=$DOMAIN" \
            -addext "subjectAltName=$SAN" 2>/dev/null
        chmod 0600 "$PRIVKEY"
    fi
    chmod 0644 "$FULLCHAIN"
    rm -f /tmp/server.csr /tmp/server.crt /tmp/v3.ext
    log "selfsigned cert ready at $CERT_DIR"
}

# --- manual (user-supplied) ---
do_manual() {
    if [ ! -f "$FULLCHAIN" ] || [ ! -f "$PRIVKEY" ]; then
        log "ERROR: SSL_MODE=manual but $FULLCHAIN / $PRIVKEY missing in $CERT_DIR"
        log "Place your own fullchain.pem and privkey.pem there and restart."
        exit 1
    fi
    if ! openssl x509 -noout -in "$FULLCHAIN" 2>/dev/null; then
        log "ERROR: $FULLCHAIN is not a valid certificate"
        exit 1
    fi
    chmod 0644 "$FULLCHAIN"; chmod 0600 "$PRIVKEY"
    log "manual cert validated"
}

# --- letsencrypt ---
ensure_acme() {
    if [ ! -x "$ACME_BIN" ]; then
        log "installing acme.sh to $ACME_HOME"
        curl -fsSL https://get.acme.sh -o /tmp/acme-install.sh
        sh /tmp/acme-install.sh --home "$ACME_HOME" >/dev/null   # keep stderr visible on failure
        rm -f /tmp/acme-install.sh
    fi
    # Always (re)assert the endpoint from STAGING. account.conf is persisted in a
    # volume, so a prior staging run would otherwise silently keep using letsencrypt_test.
    if [ "$STAGING" = "true" ]; then
        "$ACME_BIN" --set-default-ca --server letsencrypt_test >/dev/null 2>&1 || true
    else
        "$ACME_BIN" --set-default-ca --server letsencrypt >/dev/null 2>&1 || true
    fi
}

# Print "--accountemail <email>" only when EMAIL is set.
acme_email_arg() {
    [ -n "$EMAIL" ] && printf -- '--accountemail %s' "$EMAIL"
}

do_letsencrypt() {
    ensure_acme
    set -- $(domain_args)
    EMAIL_ARG="$(acme_email_arg)"
    if [ "$CHALLENGE" = "dns" ]; then
        [ -n "$DNS_PROVIDER" ] || { log "ERROR: SSL_LE_CHALLENGE=dns requires SSL_LE_DNS_PROVIDER"; exit 2; }
        log "issuing via DNS-01 ($DNS_PROVIDER)"
        # shellcheck disable=SC2086
        "$ACME_BIN" --issue "$@" --dns "$DNS_PROVIDER" --keylength ec-256 $EMAIL_ARG
    else
        log "issuing via HTTP-01 webroot (nginx must serve :80 webroot already)"
        # shellcheck disable=SC2086
        "$ACME_BIN" --issue "$@" -w "$ACME_WEBROOT" --keylength ec-256 $EMAIL_ARG
    fi
    log "installing cert to $CERT_DIR (reload hook: nginx -s reload)"
    # shellcheck disable=SC2086
    "$ACME_BIN" --install-cert -d "$DOMAIN" --ecc \
        --key-file       "$PRIVKEY" \
        --fullchain-file "$FULLCHAIN" \
        --reloadcmd      "nginx -s reload"
    chmod 0600 "$PRIVKEY"; chmod 0644 "$FULLCHAIN"
}

case "${1:-issue}" in
    issue)
        case "$MODE" in
            selfsigned) do_selfsigned ;;
            manual)     do_manual ;;
            letsencrypt)
                if [ -f "$FULLCHAIN" ] && openssl x509 -checkend 2592000 -noout -in "$FULLCHAIN" >/dev/null 2>&1; then
                    log "LE cert present and valid (>30d), skipping"
                else
                    do_letsencrypt
                fi
                ;;
            *) log "ERROR: unknown SSL_MODE=$MODE"; exit 2 ;;
        esac
        ;;
    renew)
        if [ "$MODE" = "letsencrypt" ]; then
            ensure_acme
            "$ACME_BIN" --cron --home "$ACME_HOME" >/dev/null 2>&1 || true
            log "LE renewal cron ran"
        else
            log "mode=$MODE: nothing to renew"
        fi
        ;;
    *) echo "usage: provision-cert.sh [issue|renew]" >&2; exit 2 ;;
esac
