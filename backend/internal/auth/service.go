package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/darkden-lab/argus/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"display_name"`
	AuthProvider string    `json:"auth_provider"`
	CreatedAt    time.Time `json:"created_at"`
	LastLogin    *time.Time `json:"last_login,omitempty"`
}

type AuthService struct {
	db  *db.DB
	jwt *JWTService
}

func NewAuthService(database *db.DB, jwtService *JWTService) *AuthService {
	return &AuthService{
		db:  database,
		jwt: jwtService,
	}
}

func (s *AuthService) Register(ctx context.Context, email, password, displayName string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	var user User
	err = s.db.Pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name, auth_provider)
		 VALUES ($1, $2, $3, 'local')
		 RETURNING id, email, display_name, auth_provider, created_at`,
		email, string(hash), displayName,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AuthProvider, &user.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return &user, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (string, string, error) {
	var id, storedHash string
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, password_hash FROM users WHERE email = $1 AND auth_provider = 'local'`,
		email,
	).Scan(&id, &storedHash)
	if err != nil {
		return "", "", fmt.Errorf("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password)); err != nil {
		return "", "", fmt.Errorf("invalid credentials")
	}

	_, err = s.db.Pool.Exec(ctx, `UPDATE users SET last_login = NOW() WHERE id = $1`, id)
	if err != nil {
		return "", "", fmt.Errorf("failed to update last login: %w", err)
	}

	accessToken, err := s.jwt.GenerateToken(id, email)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := s.jwt.GenerateRefreshToken(id)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	return accessToken, refreshToken, nil
}

func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (string, error) {
	claims, err := s.jwt.ValidateToken(refreshToken)
	if err != nil {
		return "", fmt.Errorf("invalid refresh token: %w", err)
	}

	var email string
	err = s.db.Pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, claims.UserID).Scan(&email)
	if err != nil {
		return "", fmt.Errorf("user not found")
	}

	accessToken, err := s.jwt.GenerateToken(claims.UserID, email)
	if err != nil {
		return "", fmt.Errorf("failed to generate access token: %w", err)
	}

	return accessToken, nil
}

func (s *AuthService) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, email, display_name, auth_provider, created_at, last_login FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.AuthProvider, &u.CreatedAt, &u.LastLogin); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *AuthService) DeleteUser(ctx context.Context, id string) error {
	result, err := s.db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id string) (*User, error) {
	var user User
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, email, display_name, auth_provider, created_at, last_login
		 FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AuthProvider, &user.CreatedAt, &user.LastLogin)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}
	return &user, nil
}
