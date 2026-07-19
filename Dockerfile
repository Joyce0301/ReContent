FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
