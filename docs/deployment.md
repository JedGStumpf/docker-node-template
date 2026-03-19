# Deployment Guide

> **Agents:** For database management (dev containers, connection strings),
> use the `rundbat` MCP tools — call `get_environment_config` at the start
> of a session. Run `rundbat mcp --help` for the full tool reference.

## Architecture

Production runs on Docker Swarm. A single server image contains both the
Express backend and the built React frontend (served via `express.static`
in production mode). An external Caddy reverse proxy reads Docker Swarm
labels for automatic HTTPS and domain routing.

```
Internet → Caddy (*.jtlapp.net) → server:3000 → Express (API + static files)
                                 → db:5432    → PostgreSQL
```

## Database Management

### Development

Dev databases are managed by **rundbat** via its MCP tools. Rundbat handles
container lifecycle (create, start, stop), credentials, and connection
strings through dotconfig.

**Agents:** Use the `get_environment_config` MCP tool to get a working
connection string. It auto-restarts stopped containers and detects drift.

**Humans:**
```bash
# rundbat commands (if using CLI directly)
rundbat mcp   # start the MCP server (configured in .mcp.json)
```

The dev database container follows the naming convention `{app}-{env}-pg`
and stores credentials in `config/{env}/secrets.env` via dotconfig.

### Production

Production uses a Postgres container in the Docker Swarm stack, configured
in `docker-compose.yml`. Credentials are managed as Docker Swarm secrets
(see [Secrets Management](secrets.md)).

## Prerequisites

- Docker context for your prod server configured and reachable
- SOPS access to decrypt `config/prod/secrets.env`
- Swarm initialized on the target host (`docker swarm init`)

## First-Time Setup

### 1. Create Swarm Secrets

Secrets must exist in the swarm before the stack can deploy:

```bash
npm run secrets:prod
```

This decrypts `config/prod/secrets.env` via SOPS and creates each key as a
Docker Swarm secret on the production context. See [Secrets Management](secrets.md)
for details.

### 2. Deploy

```bash
npm run deploy
```

The deploy script (`scripts/deploy.sh`) performs pre-flight checks then:
1. Validates clean working tree, correct branch, version tag on HEAD
2. Builds the server Docker image with the version tag
3. Pushes to the container registry
4. Deploys the stack to Docker Swarm
5. Runs Prisma migrations via a one-shot service

### 3. Version Tagging

Before deploying, tag the release:

```bash
npm run version:tag    # creates v0.YYYYMMDD.N tag
npm run deploy         # deploys the tagged version
```

## Subsequent Deployments

```bash
npm run version:tag    # tag the release
npm run deploy         # build, push, deploy, migrate
```

Docker Swarm performs rolling updates by default — new containers start
before old ones are drained.

## Caddy Labels

The external Caddy reverse proxy reads labels from the `deploy` block in
`docker-compose.yml`:

```yaml
deploy:
  labels:
    caddy: ${APP_DOMAIN:-myapp.jtlapp.net}
    caddy.reverse_proxy: "{{upstreams 3000}}"
```

`APP_DOMAIN` is set in `.env` and sourced by the deploy script.

## Rollback

To roll back to a previous image, re-deploy with a previous tag:

```bash
set -a && . .env && set +a
DOCKER_CONTEXT=$PROD_DOCKER_CONTEXT TAG=<previous-version> docker stack deploy -c docker-compose.yml $APP_NAME
```

## npm Script Reference

| Script | What It Does |
|--------|-------------|
| `npm run version:bump` | Print the next version number (does not tag) |
| `npm run version:tag` | Create annotated git tag `v0.YYYYMMDD.N` |
| `npm run deploy` | Pre-flight checks → build → push → deploy → migrate |
| `npm run secrets:prod` | Create swarm secrets from `config/prod/secrets.env` |
| `npm run secrets:prod:rm` | Remove existing swarm secrets (needed before updating) |
| `npm run build:docker` | Build prod image on the dev Docker context |

## Troubleshooting

**`secret not found: db_password`**
Swarm secrets haven't been created. Run `npm run secrets:prod` first.

**`image not found`**
The build step failed or hasn't run. `deploy` builds automatically,
but check the build output for errors.

**`HEAD is not tagged`**
Run `npm run version:tag` before deploying.

**Container won't start**
Check logs: `DOCKER_CONTEXT=<context> docker service logs <app>_server`

**Migration failures**
Connect to the database and check state:
`DOCKER_CONTEXT=<context> docker exec -it $(docker ps -q -f name=<app>_db) psql -U app`

**Dev database won't start / port conflict**
Use `rundbat` MCP tools or check `docker ps` for port conflicts. Each
project's dev database should use a unique port (configured via `DB_PORT`
in dotconfig).
