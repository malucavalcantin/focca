# Imagem do Serviço de Frequência. Construir a partir da raiz do projeto:
#   docker build -f servico-frequencia/Dockerfile -t focca-servico-frequencia .
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY compartilhado ./compartilhado
COPY servico-frequencia/src ./servico-frequencia/src

# Banco SQLite próprio do serviço, em volume
RUN mkdir -p /dados && chown node:node /dados
ENV NODE_ENV=production PORTA=3002 BD=/dados/frequencia.db
VOLUME /dados

USER node
EXPOSE 3002
CMD ["node", "servico-frequencia/src/index.js"]
