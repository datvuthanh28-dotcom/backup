# Stage 1: Build Frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

# Copy server, assets and built frontend
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY public ./public
COPY src/data ./src/data

EXPOSE 5000

CMD ["node", "server/index.js"]
