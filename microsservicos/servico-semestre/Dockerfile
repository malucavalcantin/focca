# Imagem do Serviço de Semestre e Matriz Curricular (contexto de build: a própria pasta servico-semestre/).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# O banco do serviço é o PostgreSQL próprio (DATABASE_URL, definido no docker-compose)
ENV NODE_ENV=production PORTA=3005
USER node
EXPOSE 3005
CMD ["node", "src/index.js"]