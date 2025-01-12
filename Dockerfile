FROM node:latest 

COPY . ./app

WORKDIR /app
RUN npm install
RUN npm run build

CMD ["sh", "-c", "npm run start"]
