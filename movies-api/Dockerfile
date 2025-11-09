FROM node:20-bookworm-slim
WORKDIR /app

# Copia só o package.json primeiro para aproveitar cache
COPY package.json ./

# Instala só prod (sem devDependencies)
RUN npm install --omit=dev

# Copia o restante do código
COPY app.js ./

EXPOSE 3000
CMD ["node","app.js"]


