FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs ./docs
COPY data ./data

EXPOSE 8844
CMD ["node", "apps/api/server.js"]
