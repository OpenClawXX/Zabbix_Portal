# Change to Artifactory mirror:
# FROM artifactory.example.local/docker-virtual/node:22-alpine AS build
# Package/image preference: node 22-alpine, npm 10.9.x
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# NPM packages should be pulled from Artifactory NPM registry:
# npm config set registry https://artifactory.example.local/api/npm/npm/
RUN npm ci

COPY . .
RUN npm run build

# Change to Artifactory mirror:
# FROM artifactory.example.local/docker-virtual/nginx:1.27-alpine
# Package/image preference: nginx 1.27-alpine
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
