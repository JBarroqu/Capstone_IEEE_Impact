# Wish Engine frontend: Next.js standalone server (the API is backend/Dockerfile). Build: docker compose build. Run: docker compose up.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_API_PORT=8000
# "same-origin" when a proxy serves pages and /api on one origin (docker-compose.public.yml).
ARG NEXT_PUBLIC_API_URL=
# Render passes service env vars as build args: API_HOSTPORT turns on the /api rewrite, PUBLIC_MODE adds HSTS.
ARG API_HOSTPORT=
ARG PUBLIC_MODE=
ENV NEXT_PUBLIC_API_PORT=$NEXT_PUBLIC_API_PORT NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL API_HOSTPORT=$API_HOSTPORT PUBLIC_MODE=$PUBLIC_MODE
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
