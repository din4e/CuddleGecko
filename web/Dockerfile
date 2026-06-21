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
COPY --from=builder /web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
