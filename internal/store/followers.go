package store

import (
	"context"
	"database/sql"

	"github.com/lib/pq"
)

type Follower struct {
	UserID     int64  `json:"user_id"`
	FollowerID int64  `json:follower_id`
	CreatedAt  string `json:"created_at"`
}

type FollowerStore struct {
	db *sql.DB
}

func (s *FollowerStore) Follow(ctx context.Context, followerID, userID int64) error {
	query := `
		INSERT INTO	followers (user_id, follower_id) VALUES ($1, $2)
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	_, err := s.db.ExecContext(ctx, query, userID, followerID)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			return ErrConflict
		}
	}

	return nil
}

func (s *FollowerStore) Unfollow(ctx context.Context, followerID, userID int64) error {
	query := `
		DELETE FROM followers
		WHERE user_id = $1 AND follower_id = $2
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	_, err := s.db.ExecContext(ctx, query, userID, followerID)
	return err
}

func (s *FollowerStore) GetFollowers(ctx context.Context, userID int64) ([]User, error) {
	query := `
		SELECT u.id, u.username, u.email, u.created_at, COALESCE(r.id, 0), COALESCE(r.name, ''), COALESCE(r.level, 0), COALESCE(r.description, '')
		FROM followers f
		JOIN users u ON u.id = f.follower_id
		LEFT JOIN roles r ON u.role_id = r.id
		WHERE f.user_id = $1 AND u.is_active = true
		ORDER BY f.created_at DESC
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	followers := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.Email,
			&u.CreatedAt,
			&u.Role.ID,
			&u.Role.Name,
			&u.Role.Level,
			&u.Role.Description,
		); err != nil {
			return nil, err
		}
		followers = append(followers, u)
	}

	return followers, nil
}

func (s *FollowerStore) GetFollowing(ctx context.Context, userID int64) ([]User, error) {
	query := `
		SELECT u.id, u.username, u.email, u.created_at, COALESCE(r.id, 0), COALESCE(r.name, ''), COALESCE(r.level, 0), COALESCE(r.description, '')
		FROM followers f
		JOIN users u ON u.id = f.user_id
		LEFT JOIN roles r ON u.role_id = r.id
		WHERE f.follower_id = $1 AND u.is_active = true
		ORDER BY f.created_at DESC
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	following := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.Email,
			&u.CreatedAt,
			&u.Role.ID,
			&u.Role.Name,
			&u.Role.Level,
			&u.Role.Description,
		); err != nil {
			return nil, err
		}
		following = append(following, u)
	}

	return following, nil
}

type FollowerCounts struct {
	FollowersCount int `json:"followers_count"`
	FollowingCount int `json:"following_count"`
}

func (s *FollowerStore) GetCounts(ctx context.Context, userID int64) (*FollowerCounts, error) {
	query := `
		SELECT
			(SELECT COUNT(*) FROM followers WHERE user_id = $1) AS followers_count,
			(SELECT COUNT(*) FROM followers WHERE follower_id = $1) AS following_count
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	counts := &FollowerCounts{}
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&counts.FollowersCount, &counts.FollowingCount)
	if err != nil {
		return nil, err
	}

	return counts, nil
}

func (s *FollowerStore) IsFollowing(ctx context.Context, followerID, userID int64) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM followers WHERE follower_id = $1 AND user_id = $2
		)
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	var exists bool
	err := s.db.QueryRowContext(ctx, query, followerID, userID).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func (s *FollowerStore) GetSuggested(ctx context.Context, userID int64, limit int) ([]User, error) {
	query := `
		SELECT u.id, u.username, u.email, u.created_at, COALESCE(r.id, 0), COALESCE(r.name, ''), COALESCE(r.level, 0), COALESCE(r.description, '')
		FROM users u
		LEFT JOIN roles r ON u.role_id = r.id
		WHERE u.id != $1
		  AND u.is_active = true
		  AND u.id NOT IN (SELECT user_id FROM followers WHERE follower_id = $1)
		ORDER BY u.created_at DESC
		LIMIT $2
	`
	ctx, cancel := context.WithTimeout(ctx, QueryTimeoutDuration)
	defer cancel()

	rows, err := s.db.QueryContext(ctx, query, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID,
			&u.Username,
			&u.Email,
			&u.CreatedAt,
			&u.Role.ID,
			&u.Role.Name,
			&u.Role.Level,
			&u.Role.Description,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	return users, nil
}
