# Imagem do Discovery. Construir a partir da raiz do projeto:
#   docker build -f discovery/Dockerfile -t focca-discovery .
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY compartilhado ./compartilhado
COPY discovery/src ./discovery/src

ENV NODE_ENV=production PORTA=3000
USER node
EXPOSE 3000
CMD ["node", "discovery/src/index.js"]
