# Fix Dirty Database Migration

If `make migrate-up` returns:

```text
error: Dirty database version 6. Fix and force version.
```

it means a migration failed, and the database was marked as **dirty**.

## 1. Check Migration Status

Run:

```bash
migrate -path ./cmd/migrate/migrations \
  -database "$DB_ADDR" version
```

Example output:

```text
6
dirty
```

## 2. Check the Database

For PostgreSQL running in Docker, connect to the database:

```bash
docker exec -it postgres-db psql -U admin -d socialnetwork
```

Check the `posts` table:

```sql
\d posts
```

If the columns from the failed migration already exist, such as:

```text
tags
updated_at
```

the migration changes may already have been applied successfully.

Exit PostgreSQL:

```sql
\q
```

## 3. Force the Migration Version

If migration `6` has been completely applied, mark it as clean:

```bash
migrate -path ./cmd/migrate/migrations \
  -database "$DB_ADDR" force 6
```

Then verify the migration status:

```bash
migrate -path ./cmd/migrate/migrations \
  -database "$DB_ADDR" version
```

You should see:

```text
6
```

The output should **not** include `dirty`.

## 4. Run Migrations Again

Run:

```bash
make migrate-up
```

Expected output:

```text
no change
```

This means all migrations have already been applied.
