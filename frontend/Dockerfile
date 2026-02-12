FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.app.json tsconfig.spec.json ./
COPY public/ ./public/
COPY src/ ./src/
RUN npx ng build --configuration=production

FROM nginx:alpine
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/nexvote-frontend/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
