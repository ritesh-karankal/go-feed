package main

import (
	"log"

	"github.com/ritesh-karankal/go-feed/internal/db"
	"github.com/ritesh-karankal/go-feed/internal/env"
	"github.com/ritesh-karankal/go-feed/internal/store"
)

func main() {
	addr := env.GetString("DB_ADDR", "postgres://admin:${POSTGRES_PASSWORD}@localhost:5432/socialnetwork?sslmode=disable")

	conn, err := db.New(addr, 3, 3, "15m")
	if err != nil {
		log.Fatal(err)
	}

	defer conn.Close()

	store := store.NewStorage(conn)

	db.Seed(store, conn)
}
