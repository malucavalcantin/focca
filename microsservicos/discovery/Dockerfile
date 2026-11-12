# Imagem do Discovery (contexto de build: a própria pasta discovery/).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORTA=3000
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
