# Gopher Feed

A social network backend built with **Go** and **PostgreSQL**.

## Requirements

Make sure the following tools are installed:

- [Go](https://go.dev/dl/)
- [PostgreSQL](https://www.postgresql.org/download/)
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/)
- [golang-migrate](https://github.com/golang-migrate/migrate)
- [direnv](https://direnv.net/)


## Setup

Clone the repository and enter the project directory:

```bash
git clone https://github.com/ritesh-karankal/go-feed.git
cd go-feed
```

## Environment Configuration

### Create Your Local `.envrc`

Copy the example environment file:

```bash
cp .envrc.example .envrc
```

Edit `.envrc` and replace the placeholder password with your local PostgreSQL password:

```bash
vim .envrc
```

```bash
export ADDR=":3000"

export POSTGRES_PASSWORD="<your-postgres-password>"
export DB_ADDR="postgres://admin:${POSTGRES_PASSWORD}@localhost:5432/socialnetwork?sslmode=disable"

export DB_MAX_OPEN_CONNS=30
export DB_MAX_IDLE_CONNS=30
export DB_MAX_IDLE_TIME="15m"
```

Add `.envrc` to `.gitignore`:

```gitignore
.envrc
```

Allow `direnv` to load the environment variables:

```bash
direnv allow
```

## Start PostgreSQL

Start the PostgreSQL container using Docker Compose:

```bash
docker compose up -d
```

Check that the PostgreSQL container is running:

```bash
docker ps
```

## Database Migrations

Migrations are stored in:

```text
cmd/migrate/migrations/
```

Each migration contains an `up` SQL file and a `down` SQL file.

### Create a Migration

Create a new sequential migration:

```bash
migrate create -seq \
  -ext sql \
  -dir ./cmd/migrate/migrations \
  create_users
```

### Apply Migrations

Apply all pending migrations:

```bash
migrate \
  -path=./cmd/migrate/migrations \
  -database="$DB_ADDR" \
  up
```

### Check Migration Version

Check the current migration version:

```bash
migrate \
  -path=./cmd/migrate/migrations \
  -database="$DB_ADDR" \
  version
```

### Roll Back the Latest Migration

Roll back the most recent migration:

```bash
migrate \
  -path=./cmd/migrate/migrations \
  -database="$DB_ADDR" \
  down 1
```

## Run the API

Start the API server:

```bash
go run ./cmd/*.go
```

The Gopher Feed API should now be running locally.

