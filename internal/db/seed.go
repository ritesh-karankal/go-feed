package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math/rand"

	"github.com/ritesh-karankal/go-feed/internal/store"
)

var usernames = []string{
	"Liam", "Emma", "Noah", "Olivia", "Mateo", "Sofia", "Lucas", "Amelia",
	"Oliver", "Isla", "Arjun", "Ananya", "Rohan", "Priya", "Vikram", "Meera",
	"Aditya", "Kavya", "Rahul", "Isha", "Yuki", "Haruto", "Aoi", "Ren",
	"Hana", "Minjun", "Jisoo", "Seojun", "Sora", "Jiwoo", "Mateus", "Beatriz",
	"Joao", "Camila", "Rafael", "Mariana", "Thiago", "Larissa", "Diego", "Valentina",
	"Kwame", "Amara", "Kofi", "Adwoa", "Chinedu", "Zuri", "zack", "amber", "brian",
	"carol", "doug", "eric", "fiona", "oliver", "peter", "queen", "ron", "susan",
	"Jelani", "Imani", "Ayo", "Fatima", "Thabo", "Nomsa", "Lerato", "Sipho",
	"Zanele", "Elsa", "Freja", "Lars", "Ingrid", "Erik", "Anna", "Matteo",
	"Giulia", "Lorenzo", "Chiara", "Pierre", "Camille", "Etienne", "Amelie", "Gabriel",
	"Lucia", "Elena", "Nikos", "Eleni", "Petros", "Anastasia", "Daniel", "Maria",
	"Juan", "Isabella", "Andre", "Helena", "Tiago", "Eva", "Ana", "David",
	"Kenji", "Maya", "Owen", "Nora",
}

var titles = []string{
	"The Power of Habit", "Embracing Minimalism", "Healthy Eating Tips",
	"Travel on a Budget", "Mindfulness Meditation", "Boost Your Productivity",
	"Home Office Setup", "Digital Detox", "Gardening Basics",
	"DIY Home Projects", "Yoga for Beginners", "Sustainable Living",
	"Mastering Time Management", "Exploring Nature", "Simple Cooking Recipes",
	"Fitness at Home", "Personal Finance Tips", "Creative Writing",
	"Mental Health Awareness", "Learning New Skills",
}

var contents = []string{
	"In this post, we'll explore how to develop good habits that stick and transform your life.",
	"Discover the benefits of a minimalist lifestyle and how to declutter your home and mind.",
	"Learn practical tips for eating healthy on a budget without sacrificing flavor.",
	"Traveling doesn't have to be expensive. Here are some tips for seeing the world on a budget.",
	"Mindfulness meditation can reduce stress and improve your mental well-being. Here's how to get started.",
	"Increase your productivity with these simple and effective strategies.",
	"Set up the perfect home office to boost your work-from-home efficiency and comfort.",
	"A digital detox can help you reconnect with the real world and improve your mental health.",
	"Start your gardening journey with these basic tips for beginners.",
	"Transform your home with these fun and easy DIY projects.",
	"Yoga is a great way to stay fit and flexible. Here are some beginner-friendly poses to try.",
	"Sustainable living is good for you and the planet. Learn how to make eco-friendly choices.",
	"Master time management with these tips and get more done in less time.",
	"Nature has so much to offer. Discover the benefits of spending time outdoors.",
	"Whip up delicious meals with these simple and quick cooking recipes.",
	"Stay fit without leaving home with these effective at-home workout routines.",
	"Take control of your finances with these practical personal finance tips.",
	"Unleash your creativity with these inspiring writing prompts and exercises.",
	"Mental health is just as important as physical health. Learn how to take care of your mind.",
	"Learning new skills can be fun and rewarding. Here are some ideas to get you started.",
}

var tags = []string{
	"Self Improvement", "Minimalism", "Health", "Travel", "Mindfulness",
	"Productivity", "Home Office", "Digital Detox", "Gardening", "DIY",
	"Yoga", "Sustainability", "Time Management", "Nature", "Cooking",
	"Fitness", "Personal Finance", "Writing", "Mental Health", "Learning",
}

var comments = []string{
	"Great post! Thanks for sharing.",
	"I completely agree with your thoughts.",
	"Thanks for the tips, very helpful.",
	"Interesting perspective, I hadn't considered that.",
	"Thanks for sharing your experience.",
	"Well written, I enjoyed reading this.",
	"This is very insightful, thanks for posting.",
	"Great advice, I'll definitely try that.",
	"I love this, very inspirational.",
	"Thanks for the information, very useful.",
}

// SeedPassword is the password of every seeded user (dev data only).
const SeedPassword = "password"

// Seed fills the database with sample users, posts and comments. It does
// nothing if the sample data already exists, so it is safe to run repeatedly.
func Seed(store store.Storage, db *sql.DB) error {
	ctx := context.Background()

	var seeded bool
	if err := db.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM users WHERE username = $1)`,
		usernames[0]+"0",
	).Scan(&seeded); err != nil {
		return fmt.Errorf("checking for existing seed data: %w", err)
	}
	if seeded {
		log.Println("Seed data already present, skipping")
		return nil
	}

	users, err := generateUsers(100)
	if err != nil {
		return err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	for _, user := range users {
		if err := store.Users.Create(ctx, tx, user); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("creating user %s: %w", user.Username, err)
		}

		// Seeded users skip email activation
		if _, err := tx.ExecContext(ctx, `UPDATE users SET is_active = true WHERE id = $1`, user.ID); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("activating user %s: %w", user.Username, err)
		}
	}

	// Commit before creating posts: they are inserted outside this
	// transaction and must see the users
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing users: %w", err)
	}

	posts := generatePosts(200, users)
	for _, post := range posts {
		if err := store.Posts.Create(ctx, post); err != nil {
			return fmt.Errorf("creating post: %w", err)
		}
	}

	comments := generateComments(500, users, posts)
	for _, comment := range comments {
		if err := store.Comments.Create(ctx, comment); err != nil {
			return fmt.Errorf("creating comment: %w", err)
		}
	}

	log.Printf("Seeding complete: %d users, %d posts, %d comments", len(users), len(posts), len(comments))
	return nil
}

func generateUsers(num int) ([]*store.User, error) {
	users := make([]*store.User, num)

	for i := 0; i < num; i++ {
		users[i] = &store.User{
			Username: usernames[i%len(usernames)] + fmt.Sprintf("%d", i),
			Email:    usernames[i%len(usernames)] + fmt.Sprintf("%d", i) + "@example.com",
			Role: store.Role{
				Name: "user",
			},
		}
	}

	// Hash once (bcrypt is deliberately slow) and share it across users
	if err := users[0].Password.Set(SeedPassword); err != nil {
		return nil, err
	}
	for _, user := range users[1:] {
		user.Password = users[0].Password
	}

	return users, nil
}

func generatePosts(num int, users []*store.User) []*store.Post {
	posts := make([]*store.Post, num)
	for i := 0; i < num; i++ {
		user := users[rand.Intn(len(users))]

		posts[i] = &store.Post{
			UserID:  user.ID,
			Title:   titles[rand.Intn(len(titles))],
			Content: contents[rand.Intn(len(contents))],
			Tags: []string{
				tags[rand.Intn(len(tags))],
				tags[rand.Intn(len(tags))],
			},
		}
	}

	return posts
}

func generateComments(num int, users []*store.User, posts []*store.Post) []*store.Comment {
	cms := make([]*store.Comment, num)
	for i := 0; i < num; i++ {
		cms[i] = &store.Comment{
			PostID:  posts[rand.Intn(len(posts))].ID,
			UserID:  users[rand.Intn(len(users))].ID,
			Content: comments[rand.Intn(len(comments))],
		}
	}
	return cms
}
