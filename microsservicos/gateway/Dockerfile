# Imagem do API Gateway Focca (contexto de build: a própria pasta gateway/).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORTA=8080
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
