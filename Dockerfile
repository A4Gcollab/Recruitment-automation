# Production image for the A4G recruitment app.
#
# Built fresh ON THE VPS (Linux), so it never inherits the Windows/WSL
# node_modules. Two stages:
#   - build:  npm ci + next build
#   - runner: keeps full deps so `npm run db:migrate` / `db:seed` work in-container
#
# Used by docker-compose.prod.yml. See DEPLOYMENT.md §7.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Dummy DATABASE_URL so the build doesn't trip db/index.ts's required-env check.
# It never connects at build time (routes are force-dynamic); the real value is
# injected at runtime from .env.production.
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/db ./db
# lib/ is needed by tsx for db:seed (db/schema.ts imports @/lib/email/defaults).
COPY --from=build /app/lib ./lib
EXPOSE 3000
CMD ["npm", "run", "start"]
