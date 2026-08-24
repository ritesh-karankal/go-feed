```markdown
## API Testing with cURL

### Base URL

```text
http://localhost:3000
```

## 1. Create a Post

Create a new post using `POST /v1/posts`.

```bash
curl -i -X POST http://localhost:3000/v1/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "my second post",
    "content": "This is my post for my account.",
    "tags": ["go", "backend", "postgres"]
  }'
```

### Example Response

```json
{
  "id": 2,
  "content": "This is my post for my account.",
  "title": "my second post",
  "user_id": 1,
  "tags": ["go", "backend", "postgres"],
  "created_at": "2026-08-24T08:38:07Z",
  "updated_at": "2026-08-24T08:38:07Z",
  "comments": null
}
```

The server returns `201 Created` when the post is successfully created.

## 2. Get a Post by ID

Get a specific post using its ID.

```bash
curl http://localhost:3000/v1/posts/2 | jq
```

### Example Response

```json
{
  "id": 2,
  "content": "This is my post for my account.",
  "title": "my second post",
  "user_id": 1,
  "tags": [
    "go",
    "backend",
    "postgres"
  ],
  "created_at": "2026-08-24T08:38:07Z",
  "updated_at": "2026-08-24T08:38:07Z",
  "comments": []
}
```

The `comments` field contains the comments associated with the post.

## 3. Update a Post

Update an existing post using `PATCH /v1/posts/{postID}`.

```bash
curl -X PATCH http://localhost:3000/v1/posts/2 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title",
    "content": "Updated content",
    "tags": ["go", "backend"]
  }'
```

### Example Response

```json
{
  "id": 2,
  "content": "Updated content",
  "title": "Updated title",
  "user_id": 1,
  "tags": [
    "go",
    "backend"
  ],
  "created_at": "2026-08-24T08:38:07Z",
  "updated_at": "2026-08-24T08:42:00Z",
  "comments": null
}
```

> [!NOTE]
> A `PATCH` request can update only the fields that are provided.

### Update Only the Title

```bash
curl -X PATCH http://localhost:3000/v1/posts/2 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New title"
  }'
```

### Update Only the Tags

```bash
curl -X PATCH http://localhost:3000/v1/posts/2 \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["golang", "postgresql"]
  }'
```

## 4. Create a Comment

Create a comment for a specific post using:

```text
POST /v1/posts/{postID}/comments
```

For example, to add a comment to post `2`:

```bash
curl -X POST http://localhost:3000/v1/posts/2/comments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "content": "This is a great post!"
  }'
```

### Add Another Comment

```bash
curl -X POST http://localhost:3000/v1/posts/2/comments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "content": "Really useful information."
  }'
```

### Add One More Comment

```bash
curl -X POST http://localhost:3000/v1/posts/2/comments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "content": "Thanks for sharing this!"
  }'
```

## 5. Get a Post with Comments

After creating comments, retrieve the post again:

```bash
curl http://localhost:3000/v1/posts/2 | jq
```

The response should contain the post and its comments:

```json
{
  "id": 2,
  "title": "Updated title",
  "content": "Updated content",
  "user_id": 1,
  "tags": [
    "go",
    "backend"
  ],
  "comments": [
    {
      "id": 1,
      "post_id": 2,
      "user_id": 1,
      "content": "This is a great post!"
    },
    {
      "id": 2,
      "post_id": 2,
      "user_id": 1,
      "content": "Really useful information."
    }
  ]
}
```

## 6. Delete a Post

Delete a post using its ID:

```bash
curl -X DELETE http://localhost:3000/v1/posts/1
```

If your `DELETE` endpoint returns the deleted post, you will receive the deleted post in the response.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/posts` | Create a post |
| `GET` | `/v1/posts/{postID}` | Get a post |
| `PATCH` | `/v1/posts/{postID}` | Update a post |
| `DELETE` | `/v1/posts/{postID}` | Delete a post |
| `POST` | `/v1/posts/{postID}/comments` | Create a comment |

## Quick Test Flow

You can test the API in the following order.

### 1. Create a Post

```bash
curl -X POST http://localhost:3000/v1/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "my second post",
    "content": "This is my post for my account.",
    "tags": ["go", "backend", "postgres"]
  }'
```

### 2. Get the Post

```bash
curl http://localhost:3000/v1/posts/2 | jq
```

### 3. Update the Post

```bash
curl -X PATCH http://localhost:3000/v1/posts/2 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated title",
    "content": "Updated content",
    "tags": ["go", "backend"]
  }'
```

### 4. Add a Comment

```bash
curl -X POST http://localhost:3000/v1/posts/2/comments \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "content": "This is a great post!"
  }'
```

### 5. Get the Post with Comments

```bash
curl http://localhost:3000/v1/posts/2 | jq
```

### 6. Delete the Post

```bash
curl -X DELETE http://localhost:3000/v1/posts/1
```
```
