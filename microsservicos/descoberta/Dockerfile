# Imagem do Serviço de Descoberta. Construir a partir da raiz do projeto:
#   docker build -f descoberta/Dockerfile -t focca-descoberta .
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY compartilhado ./compartilhado
COPY descoberta/src ./descoberta/src

ENV NODE_ENV=production PORTA=3000
USER node
EXPOSE 3000
CMD ["node", "descoberta/src/index.js"]
