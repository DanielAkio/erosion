# Imagem unica e autossuficiente — nenhuma dependencia de rede em runtime.
FROM node:20-alpine AS build
WORKDIR /app

# Instala deps a partir dos manifestos (cache de camadas).
COPY package.json package-lock.json* ./
RUN npm install

# Compila o TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- imagem final ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Apenas deps de producao.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Codigo compilado + assets estaticos do client (offline, sem CDNs).
COPY --from=build /app/dist ./dist
COPY public ./public

EXPOSE 8080
CMD ["node", "dist/index.js"]
