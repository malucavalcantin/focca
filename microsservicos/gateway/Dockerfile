# Imagem do API Gateway Focca. Construir a partir da raiz do projeto:
#   docker build -f gateway/Dockerfile -t focca-gateway .
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY compartilhado ./compartilhado
COPY gateway/src ./gateway/src

ENV NODE_ENV=production PORTA=8080
USER node
EXPOSE 8080
CMD ["node", "gateway/src/index.js"]
