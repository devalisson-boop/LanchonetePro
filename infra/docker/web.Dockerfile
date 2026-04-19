FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY . .

RUN npm run build --workspace @lanchonete/web

FROM nginx:1.29-alpine

COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/docker/web-entrypoint.sh /entrypoint.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
