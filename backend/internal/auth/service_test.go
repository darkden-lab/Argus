package auth

import (
	"testing"
)

func TestAuthServiceCreation(t *testing.T) {
	jwtSvc := NewJWTService("test-secret")
	svc := NewAuthService(nil, jwtSvc)
	if svc == nil {
		t.Fatal("expected non-nil AuthService")
	}
	if svc.jwt == nil {
		t.Fatal("expected non-nil JWTService in AuthService")
	}
}

func TestRegisterRequiresDB(t *testing.T) {
	jwtSvc := NewJWTService("test-secret")
	svc := NewAuthService(nil, jwtSvc)

	// Register with nil DB should panic or fail
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic when calling Register with nil DB")
		}
	}()
	_, _ = svc.Register(nil, "test@example.com", "password123", "Test User")
}

func TestLoginRequiresDB(t *testing.T) {
	jwtSvc := NewJWTService("test-secret")
	svc := NewAuthService(nil, jwtSvc)

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic when calling Login with nil DB")
		}
	}()
	_, _, _ = svc.Login(nil, "test@example.com", "wrong-password")
}
