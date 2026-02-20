package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestGenerateAndValidateJWT(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	token, err := svc.GenerateToken("user-123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != "user-123" {
		t.Errorf("expected UserID 'user-123', got '%s'", claims.UserID)
	}
	if claims.Email != "test@example.com" {
		t.Errorf("expected Email 'test@example.com', got '%s'", claims.Email)
	}
}

func TestValidateExpiredToken(t *testing.T) {
	svc := &JWTService{
		secretKey:       []byte("test-secret-key"),
		accessDuration:  -1 * time.Hour,
		refreshDuration: -1 * time.Hour,
	}

	token, err := svc.GenerateToken("user-123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	_, err = svc.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestValidateInvalidToken(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	_, err := svc.ValidateToken("not-a-valid-token")
	if err == nil {
		t.Fatal("expected error for invalid token, got nil")
	}

	// Token signed with different key
	otherSvc := NewJWTService("different-secret-key")
	token, err := otherSvc.GenerateToken("user-123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	_, err = svc.ValidateToken(token)
	if err == nil {
		t.Fatal("expected error for token signed with different key, got nil")
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	token, err := svc.GenerateRefreshToken("user-456")
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != "user-456" {
		t.Errorf("expected UserID 'user-456', got '%s'", claims.UserID)
	}

	// Refresh token should have longer expiry
	expiry := claims.ExpiresAt.Time
	if time.Until(expiry) < 24*time.Hour {
		t.Error("refresh token expiry should be more than 24 hours")
	}

	_ = jwt.SigningMethodHS256 // ensure jwt import is used
}
