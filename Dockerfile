# Build stage - React frontend (Node 18 required for react-scripts 5)
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --legacy-peer-deps && npm install ajv@^8 --legacy-peer-deps
COPY frontend/ ./
ENV REACT_APP_API_URL=/api
RUN npm run build

# Final stage
FROM node:20-alpine
RUN apk add --no-cache nginx postgresql postgresql-contrib bash

WORKDIR /app

# Backend
COPY backend/package.json ./
RUN npm install --production
COPY backend/server.js ./
COPY backend/importExportSchema.js ./
COPY backend/compat ./compat

# DB init
COPY init-db/schema.sql /docker-entrypoint-initdb.d/schema.sql

# Frontend build output
COPY --from=frontend-build /app/frontend/build /app/public

# Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Upload dir
RUN mkdir -p /app/uploads/documents /app/uploads/projects

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENV DATABASE_URL=postgresql://buildbook_web:buildbook_web@localhost:5432/buildbook_web
ENV UPLOAD_DIR=/app/uploads
ENV PORT=3001

ENTRYPOINT ["/entrypoint.sh"]
