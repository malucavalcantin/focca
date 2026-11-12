# Imagem do Serviço de Frequência (contexto de build: a própria pasta servico-frequencia/).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# O banco do serviço é o PostgreSQL próprio (DATABASE_URL, definido no docker-compose)
ENV NODE_ENV=production PORTA=3002
USER node
EXPOSE 3002
CMD ["node", "src/index.js"]
