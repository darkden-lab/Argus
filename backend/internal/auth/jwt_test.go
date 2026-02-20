package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"strings"
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

// --- Security Tests ---

// TestJWTAlgorithmConfusionNone verifies that tokens with alg:none are rejected,
// preventing the classic JWT "none" algorithm attack.
func TestJWTAlgorithmConfusionNone(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	// Craft a token with alg:none
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"admin","email":"admin@evil.com","exp":9999999999}`))
	fakeToken := header + "." + payload + "."

	_, err := svc.ValidateToken(fakeToken)
	if err == nil {
		t.Fatal("SECURITY: accepted token with alg:none - algorithm confusion vulnerability")
	}
}

// TestJWTAlgorithmConfusionRS256 verifies that tokens signed with a different
// algorithm family (RS256/ES256) are rejected even if they are valid JWTs.
func TestJWTAlgorithmConfusionRS256(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	// Create a token signed with ECDSA (different algorithm family)
	ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate EC key: %v", err)
	}

	claims := jwt.MapClaims{
		"sub":   "admin",
		"email": "admin@evil.com",
		"exp":   time.Now().Add(time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	tokenStr, err := token.SignedString(ecKey)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	_, err = svc.ValidateToken(tokenStr)
	if err == nil {
		t.Fatal("SECURITY: accepted token signed with ES256 when expecting HMAC - algorithm confusion vulnerability")
	}
}

// TestJWTTokenTampering verifies that modifying claims in a signed token
// causes validation to fail.
func TestJWTTokenTampering(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	token, err := svc.GenerateToken("user-123", "user@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	// Tamper with the payload: change user ID
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatal("expected 3 JWT parts")
	}

	// Decode payload, modify, re-encode
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("failed to decode payload: %v", err)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		t.Fatalf("failed to unmarshal payload: %v", err)
	}
	payload["sub"] = "admin-escalated"
	payload["email"] = "admin@evil.com"

	tamperedPayload, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	tamperedToken := parts[0] + "." + base64.RawURLEncoding.EncodeToString(tamperedPayload) + "." + parts[2]

	_, err = svc.ValidateToken(tamperedToken)
	if err == nil {
		t.Fatal("SECURITY: accepted tampered token - signature verification is broken")
	}
}

// TestJWTEmptySecret verifies behavior with empty secret key.
func TestJWTEmptySecret(t *testing.T) {
	svc := NewJWTService("")

	token, err := svc.GenerateToken("user-1", "u@test.com")
	if err != nil {
		// Acceptable: refusing to generate with empty key
		return
	}

	// Even if generation succeeds, a different service must reject it
	otherSvc := NewJWTService("non-empty-secret")
	_, err = otherSvc.ValidateToken(token)
	if err == nil {
		t.Fatal("SECURITY: token generated with empty secret accepted by service with different secret")
	}
}

// TestJWTMalformedTokenVariants tests various malformed token strings.
func TestJWTMalformedTokenVariants(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	malformed := []string{
		"",
		".",
		"..",
		"...",
		"a.b.c",
		"eyJhbGciOiJIUzI1NiJ9..",          // valid header, empty payload+sig
		"eyJhbGciOiJIUzI1NiJ9.eyJ9.",      // truncated payload
		strings.Repeat("A", 10000),          // oversized
		"Bearer eyJhbGciOiJIUzI1NiJ9.e30.", // Bearer prefix (should not be accepted raw)
		"\x00\x01\x02",                      // binary garbage
		"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.INVALID_SIG",
	}

	for _, tok := range malformed {
		_, err := svc.ValidateToken(tok)
		if err == nil {
			t.Errorf("SECURITY: accepted malformed token: %q", tok)
		}
	}
}

// TestJWTSignatureStripping verifies that removing the signature fails.
func TestJWTSignatureStripping(t *testing.T) {
	svc := NewJWTService("test-secret-key")

	token, err := svc.GenerateToken("user-123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	parts := strings.Split(token, ".")
	// Token with empty signature
	strippedToken := parts[0] + "." + parts[1] + "."

	_, err = svc.ValidateToken(strippedToken)
	if err == nil {
		t.Fatal("SECURITY: accepted token with stripped signature")
	}
}
