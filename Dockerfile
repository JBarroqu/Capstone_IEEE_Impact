# Impact++: one image serving the API and the built React app on one origin (docs/ARCHITECTURE.md, T-03).
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Browser-side settings are baked in at build time (Render passes service env vars as build args).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_GOOGLE_AUTH=off
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY VITE_GOOGLE_AUTH=$VITE_GOOGLE_AUTH
RUN npx vite build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend DATA_DIR=/app/data SPA_DIR=/app/frontend/dist \
    CATALOG_PATH=/app/data/catalog.json
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY backend/scripts backend/scripts
COPY data data
COPY --from=web /web/dist frontend/dist
RUN useradd -r app && chown -R app /app
USER app
EXPOSE 8000
# ONE worker (T-11): model health, rate limits and background jobs live in memory.
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
