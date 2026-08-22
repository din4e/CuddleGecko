# ---------- builder ----------
# NOTE: uses the alpine variant so the base image is already cached locally
# (docker.io pulls of the bookworm variant stall in some networks).
FROM golang:1.25-alpine AS builder
WORKDIR /app

# CGO toolchain for mattn/go-sqlite3 (unconditionally imported by pkg/database,
# so CGO stays on even when production runs on MySQL).
# Alpine's default CDN stalls badly on CN networks (gcc alone can take 20min);
# swap to the Aliyun mirror, same pattern as GOPROXY below.
RUN sed -i 's#https://dl-cdn.alpinelinux.org#https://mirrors.aliyun.com#' /etc/apk/repositories \
    && apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
# Use a CN-accessible mirror first; proxy.golang.org can be flaky on some networks.
ENV GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 go build -ldflags="-s -w" -trimpath -o /out/cuddlegecko ./cmd/server

# ---------- runtime ----------
FROM alpine:latest

# ca-certificates for HTTPS (LLM providers, acme.sh); tzdata for time zones.
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /out/cuddlegecko /app/cuddlegecko

EXPOSE 8080
ENTRYPOINT ["/app/cuddlegecko"]
