# dnsresolver

`dnsresolver` is a distributed network diagnostics system built around a control-plane API and remotely deployed worker agents. Despite the repository name, it is not a standalone recursive DNS resolver; DNS lookup is one of several supported probe types alongside HTTP checks, TCP connectivity checks, ICMP ping, and traceroute.

The project's core idea is to register remote agents, broadcast diagnostic tasks through RabbitMQ, execute them close to the target network edge, and persist per-agent results in PostgreSQL. That makes it a useful systems engineering project for evaluating task orchestration, agent lifecycle management, and geographically distributed network visibility.

## Overview

The repository contains two NestJS services:

- `resolver-core-api`: the control plane that creates agents, accepts tasks, broadcasts work, stores results, streams task events, and deploys agents over SSH with Ansible.
- `resolver-agent`: the worker process that connects to RabbitMQ, announces itself, executes network diagnostics, and reports results back.

In practice, this is closer to a distributed diagnostics/orchestration platform than a pure DNS server. DNS resolution is implemented through the agent's `dns.resolveAny()` task and can be evaluated alongside latency, reachability, and routing probes from multiple agents.

## Why This Project Is Interesting

- It separates control plane and execution plane cleanly.
- It uses RabbitMQ both for task fanout and for agent presence/status reporting.
- It records the same task across multiple agents, which is useful for comparing network behavior by location.
- It includes real deployment automation for agents instead of limiting the system to localhost development.
- It combines API design, async messaging, database modeling, and systems tooling in one codebase.

## Features

### Distributed task execution

- Create diagnostic tasks through the core API.
- Broadcast each task to all connected agents via a RabbitMQ `fanout` exchange.
- Track per-agent execution state in PostgreSQL.
- Consume task progress and completion events over Server-Sent Events.

### Supported probe types

- HTTP reachability and response metadata
- ICMP ping
- TCP port connectivity checks
- DNS lookup via `dns.resolveAny()`
- Traceroute

### Agent management

- Create agent credentials dynamically.
- Provision RabbitMQ users and permissions for each agent through the RabbitMQ HTTP API.
- Record agent IP, geolocation, status, and last-seen timestamps.
- Deploy agents to remote Ubuntu hosts with Ansible and Docker.

### Operator-facing API capabilities

- List registered agents
- List tasks executed by a specific agent
- Query a single task with linked agent results
- Return per-agent task counts for the last 24 hours
- Resolve host geolocation through an external IP geolocation API

## Architecture

The system is organized as a central coordinator plus many workers:

1. An operator creates a task through `resolver-core-api`.
2. The core service stores the task in PostgreSQL.
3. The core service publishes the task to the RabbitMQ `tasks` fanout exchange.
4. Every connected agent has its own queue bound to that exchange, so every agent receives the task.
5. Each agent reports `initialized` and later `completed` or `failed` to the `results` queue.
6. The core service persists per-agent task state and emits SSE events for clients.
7. Agents also publish presence messages to the `agent-status` queue, allowing the core service to update inventory and liveness metadata.

```mermaid
flowchart LR
    Client[Operator / UI / API client] --> Core[resolver-core-api]
    Core --> DB[(PostgreSQL)]
    Core -->|publish task| RMQ[(RabbitMQ)]
    RMQ -->|fanout| A1[resolver-agent #1]
    RMQ -->|fanout| A2[resolver-agent #2]
    RMQ -->|fanout| A3[resolver-agent #N]
    A1 -->|results + status| RMQ
    A2 -->|results + status| RMQ
    A3 -->|results + status| RMQ
    RMQ --> Core
    Core -->|SSE stream| Client
    Core -->|deploy via SSH/Ansible| Host[Remote Ubuntu host]
```

## Tech Stack

- TypeScript
- Node.js 22
- NestJS 11
- RabbitMQ with AMQP and RabbitMQ HTTP management API
- PostgreSQL
- Drizzle ORM and Drizzle Kit
- Axios
- JWT authentication for admin endpoints
- Ansible for remote provisioning
- Docker for service packaging and remote agent runtime
- Native/system networking tools in the agent: `dns/promises`, `net`, `ping`, `traceroute`

## Repository Structure

```text
.
├── resolver-core-api/     # Control-plane API, DB schema, RabbitMQ integration, agent deployment
│   ├── src/agent/         # Agent registration and credential provisioning
│   ├── src/core/          # Task creation, result ingestion, SSE streaming, heartbeat
│   ├── src/admin/         # Admin login, password hashing, agent deployment, SSH key access
│   ├── src/ipgeo/         # External IP geolocation integration
│   ├── src/db/            # Drizzle schema and DB provider
│   └── playbooks/         # Ansible playbook for deploying agents
└── resolver-agent/        # Remote worker that executes network diagnostic tasks
    └── src/tasks/         # RabbitMQ consumer and probe implementations
```

## How It Works

### 1. Agent creation

`POST /agent` creates a database record for a new agent and generates an `accessKey` and `accessSecret`. The core API then calls the RabbitMQ management API to:

- hash the password,
- create a dedicated RabbitMQ user,
- grant permissions,
- and limit the user to a single connection.

Those credentials are what the remote agent uses to authenticate to RabbitMQ.

### 2. Agent bootstrap

When `resolver-agent` starts, it:

- reads `ACCESS_KEY`, `ACCESS_SECRET`, and `RABBITMQ_HOST`,
- connects to RabbitMQ,
- creates a durable queue named `tasks:<accessKey>`,
- binds that queue to the `tasks` fanout exchange,
- fetches its public IP from `https://api.ipify.org`,
- and publishes an `online` status message to `agent-status`.

The core API consumes that status message, geolocates the IP, and updates the `agents` table.

### 3. Task dispatch

`POST /core/task` accepts a `type` and a `url`. The service normalizes the input, stores the task in PostgreSQL, derives the payload fields needed by the selected probe, and publishes the task to RabbitMQ.

Because the exchange type is `fanout`, every connected agent receives the same task.

### 4. Probe execution

The agent supports these task types:

- `http-check`: performs an HTTP GET and returns status, response time, headers, and remote IP.
- `ping`: runs ICMP probing through the `ping` package.
- `tcp-check`: opens a TCP socket to the target host and port.
- `dns-lookup`: resolves records with `dns.resolveAny()`.
- `traceroute`: runs a traceroute and returns hop data.

### 5. Result collection

Each agent first emits an `initialized` message, then sends a final `completed` result. The core API stores state in the `tasks_to_agents` table and pushes SSE messages such as `agent-initialized` and `agent-completed` to connected clients.

### 6. Heartbeat and inventory

Every 15 seconds, the core service queries the RabbitMQ management API for active connections and marks agents as `online` or `offline` in PostgreSQL.

## Getting Started

There is no root workspace script or `docker-compose` file in the repository, so the two services are started independently.

### Prerequisites

- Node.js 22
- npm
- PostgreSQL
- RabbitMQ with the management API enabled
- An IP geolocation API key for `api.ipgeolocation.io` if you want agent geolocation features

### 1. Install dependencies

```bash
cd resolver-core-api && npm install
cd ../resolver-agent && npm install
```

### 2. Configure the core API

Create `resolver-core-api/.env` with the variables used by the service:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dnsresolver
RABBITMQ_URL=amqp://localhost
RABBITMQ_HTTP_URL=http://localhost:15672/api
JWT_CONSTANT=change-me
IPGEO_API_KEY=your-ipgeolocation-key

# Needed only for remote agent deployment
PAT_TOKEN=your-registry-token
SSH_KEY_PATH=/absolute/path/to/private/key
RABBITMQ_EXTERNAL_HOST=your-rabbitmq-host:5672
AGENT_IMAGE=resolver/agent:latest
```

Apply the schema:

```bash
cd resolver-core-api
npm run db:push
```

Start the API:

```bash
cd resolver-core-api
npm run start:dev
```

### 3. Configure an agent

Start by creating an agent through the core API, or provision credentials manually if you are inspecting the system locally.

Create `resolver-agent/.env`:

```env
PORT=3000
ACCESS_KEY=agent-id-from-core-api
ACCESS_SECRET=agent-secret-from-core-api
RABBITMQ_HOST=localhost:5672
```

Start the agent:

```bash
cd resolver-agent
npm run start:dev
```

### 4. Create a task

Example: DNS lookup

```bash
curl -X POST http://localhost:3000/core/task \
  -H 'Content-Type: application/json' \
  -d '{"type":"dns-lookup","url":"example.com"}'
```

Example: subscribe to task events

```bash
curl -N http://localhost:3000/core/task/stream
```

## Development and Testing

### Core API

```bash
cd resolver-core-api
npm run build
npm run start:dev
npm run db:push
```

### Agent

```bash
cd resolver-agent
npm run build
npm run start:dev
npm run lint
```

Notes:

- The agent package defines Jest scripts, but no committed test files were found in the repository.
- The core API package does not currently expose `test` or `lint` scripts in `package.json`.

## Docker Images

Both services include multi-stage Dockerfiles:

- `resolver-core-api/Dockerfile` builds the NestJS API and installs Ansible plus the `community.docker` collection in the runtime image.
- `resolver-agent/Dockerfile` builds the worker and installs `traceroute` and `iputils-ping` so the runtime container can execute the supported probes.

## Limitations and Current Status

- This repository does not implement a recursive DNS resolver, authoritative DNS server, or DNS relay.
- DNS functionality is currently one probe type executed by distributed agents using the Node.js runtime resolver.
- There is no root-level local orchestration file for PostgreSQL and RabbitMQ.
- Automated test coverage is minimal in the checked-in codebase.
- Task routing is broadcast-based: every connected agent receives every task.
- Remote deployment is opinionated toward Ubuntu hosts with Docker and a private registry login flow defined in the Ansible playbook.
- Some admin capabilities depend on external infrastructure and secrets that are not part of the repository.

## Documentation

- `resolver-core-api/README.md` and `resolver-agent/README.md` exist, but they are still the default NestJS starter documents.
- Key implementation references: `resolver-core-api/src/core/core.service.ts`, `resolver-core-api/src/agent/agent.service.ts`, `resolver-core-api/src/admin/admin.service.ts`, `resolver-agent/src/tasks/tasks.service.ts`
