FROM node:20-slim

WORKDIR /game

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]