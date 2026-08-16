package storage

import (
	"context"

)
type UsersStore struct {
	db *sql.DB
}

func (s *UsersStore) Create(ctx context.Context) error {
	query := `
	INSERT INTO users (username, password, email) VALUEES($1, $2, $3) RETURNING id, created_at
	`

	err := s.db.QueryRowContext(
		ctx, 
		user.Username,
		user.Password,
		user.Email,
	).Scan(
		&user.ID,
		&user.CreatedAt,
	)

	if err != nil {
		return nil
	}
	}
	return nil
}