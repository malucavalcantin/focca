# Imagem do Serviço de Notas (contexto de build: a própria pasta servico-notas/).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# O banco do serviço é o PostgreSQL próprio (DATABASE_URL, definido no docker-compose)
ENV NODE_ENV=production PORTA=3001
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]
