# Wish Engine API (FastAPI). Build context is the repo root so data/ can be copied in.
FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app DATA_DIR=/app/data
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/wish_api ./wish_api
COPY backend/scripts ./scripts
COPY data ./data
RUN useradd -r app && chown -R app /app
USER app
EXPOSE 8000
# One worker on purpose: model health, cooldowns and the Gemini request queue live in memory.
CMD ["uvicorn", "wish_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
