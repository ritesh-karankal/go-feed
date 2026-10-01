// Command migrate applies the embedded SQL migrations to the database at
// DB_ADDR. It runs as an init container of the API Deployment.
package main

import (
	"embed"
	"errors"
	"log"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/ritesh-karankal/go-feed/internal/env"
)

//go:embed migrations/*.sql
var migrations embed.FS

const (
	connectAttempts = 30
	connectInterval = 2 * time.Second
)

func main() {
	addr := env.GetString("DB_ADDR", "")
	if addr == "" {
		log.Fatal("DB_ADDR is not set")
	}

	src, err := iofs.New(migrations, "migrations")
	if err != nil {
		log.Fatal(err)
	}

	// The database may still be starting (e.g. Postgres pod scheduled at the
	// same time as the API), so retry the initial connection for a while.
	var m *migrate.Migrate
	for attempt := 1; ; attempt++ {
		m, err = migrate.NewWithSourceInstance("iofs", src, addr)
		if err == nil {
			break
		}
		if attempt == connectAttempts {
			log.Fatalf("could not connect to database after %d attempts: %v", attempt, err)
		}
		log.Printf("database not ready (attempt %d/%d): %v", attempt, connectAttempts, err)
		time.Sleep(connectInterval)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatal(err)
	}

	version, dirty, err := m.Version()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("migrations applied: version=%d dirty=%t", version, dirty)
}
