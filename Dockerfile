FROM node:22-alpine
WORKDIR /app
COPY . .
# dados pessoais ficam no volume /app/data (veja docker-compose.yml)
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
