FROM node:22.10.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig*.json nest-cli* ./

RUN npm ci 

COPY ./src ./src

RUN npm run build

FROM node:22.10.0 AS image

WORKDIR /app

RUN apt update && apt install -y traceroute

COPY --from=build /app/package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

CMD ["npm", "run", "start:prod"]