FROM node:22.10.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig*.json nest-cli* .ansible.cfg ./
COPY playbooks ./playbooks

RUN npm ci 

COPY ./src ./src

RUN npm run build

FROM node:22.10.0 AS image

WORKDIR /app

ENV PATH="/root/.local/bin:${PATH}"

RUN apt update && apt-get install -y python3 pipx ca-certificates && rm -rf /var/lib/apt/lists/* && \
    pipx install --include-deps ansible && \
    ansible-galaxy --version && \
    ansible-galaxy collection install community.docker

COPY --from=build /app/playbooks /app/playbooks
COPY --from=build /app/.ansible.cfg /root/.ansible.cfg
COPY --from=build /app/package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

CMD ["npm", "run", "start:prod"]