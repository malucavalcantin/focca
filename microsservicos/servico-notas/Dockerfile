# Imagem do Serviço de Notas. Construir a partir da raiz do projeto:
#   docker build -f servico-notas/Dockerfile -t focca-servico-notas .
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY compartilhado ./compartilhado
COPY servico-notas/src ./servico-notas/src

# Banco SQLite próprio do serviço, em volume
RUN mkdir -p /dados && chown node:node /dados
ENV NODE_ENV=production PORTA=3001 BD=/dados/notas.db
VOLUME /dados

USER node
EXPOSE 3001
CMD ["node", "servico-notas/src/index.js"]
