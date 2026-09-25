package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var (
	ErrNotFound          = errors.New("resource not found")
	ErrConflict          = errors.New("resource already exists")
	ErrEditConflict      = errors.New("edit conflict")
	QueryTimeoutDuration = time.Second * 5
)

type Storage struct {
	Posts interface {
		GetByID(context.Context, int64) (*Post, error)
		Create(context.Context, *Post) error
		Delete(context.Context, int64) error
		Update(context.Context, *Post) error
		GetUserFeed(context.Context, int64, PaginatedFeedQuery) ([]PostWithMetadata, error)
		GetByUserID(context.Context, int64) ([]PostWithMetadata, error)
	}
	Users interface {
		Create(context.Context, *sql.Tx, *User) error
		GetByID(context.Context, int64) (*User, error)
		GetByEmail(context.Context, string) (*User, error)
		CreateAndInvite(ctx context.Context, user *User, token string, invitationExp time.Duration) error
		Activate(context.Context, string) error
		Delete(context.Context, int64) error
	}

	Comments interface {
		GetByPostID(context.Context, int64) ([]Comment, error)
		Create(context.Context, *Comment) error
	}

	Followers interface {
		Follow(ctx context.Context, followerID, userID int64) error
		Unfollow(ctx context.Context, followerID, userID int64) error
		GetFollowers(ctx context.Context, userID int64) ([]User, error)
		GetFollowing(ctx context.Context, userID int64) ([]User, error)
		GetCounts(ctx context.Context, userID int64) (*FollowerCounts, error)
		IsFollowing(ctx context.Context, followerID, userID int64) (bool, error)
		GetSuggested(ctx context.Context, userID int64, limit int) ([]User, error)
	}

	Roles interface {
		GetByName(context.Context, string) (*Role, error)
	}
}

func NewStorage(db *sql.DB) Storage {
	return Storage{
		Posts:     &PostStore{db},
		Users:     &UserStore{db},
		Comments:  &CommentStore{db},
		Followers: &FollowerStore{db},
		Roles:     &RoleStore{db},
	}
}

func withTx(db *sql.DB, ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}
