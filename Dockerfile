# syntax=docker/dockerfile:1

# 公共依赖层：web 与 verify 共用
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 一次性验收：单元测试（页码公式）+ 类型检查 + 生产构建 + 对 web 的冒烟检查
FROM deps AS verify
COPY . .
CMD ["npm", "run", "verify"]

# 生产构建
FROM deps AS build
COPY . .
RUN npm run build

# 纯静态托管，无任何业务后端
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
