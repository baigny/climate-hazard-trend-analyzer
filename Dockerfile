FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js tsconfig.json ./
COPY src ./src
COPY scripts/build-locations.mjs ./scripts/build-locations.mjs
RUN npm run locations
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY --from=frontend /app/backend/data/locations ./backend/data/locations
COPY --from=frontend /app/dist ./dist
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
ENV DB_BACKEND=mongodb
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
