# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app

# The root package.json declares workspace packages, so npm ci needs the
# package.json of every workspace even though only client is built.
COPY package.json package-lock.json ./
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/

# --ignore-scripts is required: the root postinstall runs `uv sync`, and there is
# no uv (or need for it) in the web image.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

COPY tsconfig.json ./
COPY packages/client ./packages/client

# Type errors are caught by `npm run typecheck` / CI, not by the image build.
RUN npm run build -w @medirag/client


FROM nginx:stable-alpine
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80
