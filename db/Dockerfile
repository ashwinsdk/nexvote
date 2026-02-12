FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY knexfile.js ./
COPY migrations/ ./migrations/
COPY seeds/ ./seeds/
CMD ["npx", "knex", "migrate:latest", "--knexfile", "knexfile.js"]
