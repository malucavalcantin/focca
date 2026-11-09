# Imagem do Serviço de Frequência. Construir a partir da raiz do projeto:
#   docker build -f servico-frequencia/Dockerfile -t focca-servico-frequencia .
FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY compartilhado ./compartilhado
COPY servico-frequencia/src ./servico-frequencia/src

# O banco do serviço é o PostgreSQL próprio (DATABASE_URL, definido no docker-compose)
ENV NODE_ENV=production PORTA=3002
USER node
EXPOSE 3002
CMD ["node", "servico-frequencia/src/index.js"]
