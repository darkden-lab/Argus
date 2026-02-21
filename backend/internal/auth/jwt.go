package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TokenType constants distinguish access tokens from refresh tokens.
const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

type Claims struct {
	UserID    string `json:"sub"`
	Email     string `json:"email"`
	TokenType string `json:"token_type,omitempty"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secretKey       []byte
	accessDuration  time.Duration
	refreshDuration time.Duration
}

func NewJWTService(secretKey string) *JWTService {
	return &JWTService{
		secretKey:       []byte(secretKey),
		accessDuration:  15 * time.Minute,
		refreshDuration: 7 * 24 * time.Hour,
	}
}

func (j *JWTService) GenerateToken(userID, email string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Email:     email,
		TokenType: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(j.accessDuration)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secretKey)
}

func (j *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secretKey, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	// Reject refresh tokens when an access token is expected.
	// Tokens without a TokenType (legacy) are allowed for backward compatibility.
	if claims.TokenType == TokenTypeRefresh {
		return nil, fmt.Errorf("invalid token: refresh token cannot be used as access token")
	}
	return claims, nil
}

// ValidateRefreshToken validates a token string and ensures it is a refresh token.
func (j *JWTService) ValidateRefreshToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secretKey, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	if claims.TokenType != TokenTypeRefresh {
		return nil, fmt.Errorf("invalid token: expected refresh token")
	}
	return claims, nil
}

func (j *JWTService) GenerateRefreshToken(userID string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		TokenType: TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(j.refreshDuration)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secretKey)
}
