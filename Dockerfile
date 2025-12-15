FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Install dependencies for IBKR Gateway
# - OpenJDK 11 for running the Java-based gateway
# - curl and unzip for downloading the gateway
# - bash for running the gateway scripts
RUN apk add --no-cache openjdk11-jre-headless curl unzip bash

# Download and install IBKR Client Portal Gateway
# The gateway extracts to /opt/ibkr with bin/, root/, dist/ subdirectories
ENV GATEWAY_DIR=/opt/ibkr

RUN mkdir -p /opt/ibkr && \
    curl -L "https://download2.interactivebrokers.com/portal/clientportal.gw.zip" -o /tmp/gateway.zip && \
    unzip /tmp/gateway.zip -d /opt/ibkr && \
    rm /tmp/gateway.zip && \
    chmod +x ${GATEWAY_DIR}/bin/run.sh

# Copy the bridge application
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Default environment variables
ENV PORT=3000
ENV HOST=0.0.0.0
ENV GATEWAY_PORT=5000
ENV GATEWAY_PATH=/opt/ibkr
ENV GATEWAY_CONFIG_PATH=/opt/ibkr/root/conf.yaml

# Expose ports
# 3000 - Bridge REST API
# 5000 - IBKR Gateway (internal)
EXPOSE 3000
EXPOSE 5000

# Health check against the bridge API
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
