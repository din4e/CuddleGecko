# ---------- builder ----------
FROM golang:1.25-bookworm AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# mattn/go-sqlite3 is unconditionally imported by pkg/database, so CGO stays on
# even when production runs on MySQL. Build only the server binary to keep the
# image small — seed/migrate tools run from the dev environment.
ENV CGO_ENABLED=1
RUN go build -ldflags="-s -w" -trimpath -o /out/cuddlegecko ./cmd/server

# ---------- runtime ----------
# Skip apt-get entirely: the bookworm-slim base already has libc6, and we copy
# ca-certificates + tzdata from the builder stage. This keeps the image small
# AND avoids flaky apt-mirror failures (e.g. debian-security 502).
FROM debian:bookworm-slim

COPY --from=builder /etc/ssl/certs /etc/ssl/certs
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

WORKDIR /app
COPY --from=builder /out/cuddlegecko /app/cuddlegecko

EXPOSE 8080
ENTRYPOINT ["/app/cuddlegecko"]
