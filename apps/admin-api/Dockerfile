FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node ace build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/build ./
RUN npm ci --omit=dev
EXPOSE 5000
CMD ["node", "bin/server.js"]
