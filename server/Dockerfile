FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
ENV DB_PATH=/data/library.db
VOLUME ["/data"]
EXPOSE 4000
CMD ["node", "server.js"]
