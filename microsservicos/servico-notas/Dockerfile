# Imagem do Serviço de Notas. Construir a partir da raiz do projeto:
#   docker build -f servico-notas/Dockerfile -t focca-servico-notas .
FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY compartilhado ./compartilhado
COPY servico-notas/src ./servico-notas/src

# O banco do serviço é o PostgreSQL próprio (DATABASE_URL, definido no docker-compose)
ENV NODE_ENV=production PORTA=3001
USER node
EXPOSE 3001
CMD ["node", "servico-notas/src/index.js"]
