# API Testing with cURL

## Base URL

```text
http://localhost:3000
```

## Posts

### Create a post

```bash
curl -X POST http://localhost:3000/v1/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My second post",
    "content": "This is my post.",
    "tags": ["go", "backend", "postgres"]
  }'
```

### Get a post

```bash
curl http://localhost:3000/v1/posts/2 | jq
```

### Update a post

```bash
curl -X PATCH http://localhost:3000/v1/posts/2 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title",
    "content": "Updated content",
    "tags": ["go", "backend"]
  }'
```

`PATCH` updates only the fields provided.

### Delete a post

```bash
curl -X DELETE http://localhost:3000/v1/posts/2
```

## Comments

### Create a comment

```bash
curl -X POST http://localhost:3000/v1/posts/2/comments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "content": "This is a great post!"
  }'
```

### Get a post with comments

```bash
curl http://localhost:3000/v1/posts/2 | jq
```

## Users

### Follow a user

```bash
curl -X PUT http://localhost:3000/v1/users/2/follow \
  -H "Content-Type: application/json" \
  -d '{"user_id": 4}'
```

### Unfollow a user

```bash
curl -X PUT http://localhost:3000/v1/users/2/unfollow \
  -H "Content-Type: application/json" \
  -d '{"user_id": 4}'
```

## User Feed

### Get the feed

```bash
curl http://localhost:3000/v1/users/feed | jq
```

### Pagination

```bash
# First 10 posts
curl "http://localhost:3000/v1/users/feed?limit=10&offset=0" | jq

# Next 10 posts
curl "http://localhost:3000/v1/users/feed?limit=10&offset=10" | jq
```

The maximum allowed `limit` is `20`.

### Sorting

```bash
# Ascending
curl "http://localhost:3000/v1/users/feed?sort=asc" | jq

# Descending
curl "http://localhost:3000/v1/users/feed?sort=desc" | jq
```

### Search

Searches post titles and content.

```bash
curl "http://localhost:3000/v1/users/feed?search=DIY" | jq
```

### Filter by tags

```bash
# One tag
curl "http://localhost:3000/v1/users/feed?tags=Minimalism" | jq

# Multiple tags
curl "http://localhost:3000/v1/users/feed?tags=Mental%20Health,Minimalism" | jq
```

Multiple tags are comma-separated, and the post must contain all specified tags.

### Combine filters

```bash
curl "http://localhost:3000/v1/users/feed?limit=10&offset=0&sort=desc&search=DIY&tags=Minimalism" | jq
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/posts` | Create a post |
| `GET` | `/v1/posts/{postID}` | Get a post |
| `PATCH` | `/v1/posts/{postID}` | Update a post |
| `DELETE` | `/v1/posts/{postID}` | Delete a post |
| `POST` | `/v1/posts/{postID}/comments` | Create a comment |
| `PUT` | `/v1/users/{userID}/follow` | Follow a user |
| `PUT` | `/v1/users/{userID}/unfollow` | Unfollow a user |
| `GET` | `/v1/users/feed` | Get the user feed |