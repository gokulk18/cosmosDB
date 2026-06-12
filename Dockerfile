# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["npm", "start"]
