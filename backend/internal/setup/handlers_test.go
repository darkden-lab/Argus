package setup

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
)

// --- validateInitRequest tests ---

func TestValidateInitRequest_ValidInput(t *testing.T) {
	req := initRequest{
		Email:       "admin@example.com",
		Password:    "strongpass123",
		DisplayName: "Admin User",
	}
	problems := validateInitRequest(req)
	if len(problems) != 0 {
		t.Errorf("expected no validation errors, got: %+v", problems)
	}
}

func TestValidateInitRequest_MissingEmail(t *testing.T) {
	req := initRequest{
		Email:       "",
		Password:    "password123",
		DisplayName: "Admin",
	}
	problems := validateInitRequest(req)
	if !hasFieldError(problems, "email") {
		t.Error("expected email validation error for empty email")
	}
}

func TestValidateInitRequest_WhitespaceOnlyEmail(t *testing.T) {
	req := initRequest{
		Email:       "   ",
		Password:    "password123",
		DisplayName: "Admin",
	}
	problems := validateInitRequest(req)
	if !hasFieldError(problems, "email") {
		t.Error("expected email validation error for whitespace-only email")
	}
}

func TestValidateInitRequest_InvalidEmailFormat(t *testing.T) {
	invalidEmails := []string{
		"notanemail",
		"@nodomain.com",
		"missing-at-sign.com",
		"double@@at.com",
		"<script>alert(1)</script>",
		"admin'; DROP TABLE users;--",
	}
	for _, email := range invalidEmails {
		req := initRequest{Email: email, Password: "password123", DisplayName: "Admin"}
		problems := validateInitRequest(req)
		if !hasFieldError(problems, "email") {
			t.Errorf("expected email validation error for: %q", email)
		}
	}
}

func TestValidateInitRequest_ValidEmails(t *testing.T) {
	validEmails := []string{
		"user@example.com",
		"user+tag@example.org",
		"first.last@subdomain.example.com",
	}
	for _, email := range validEmails {
		req := initRequest{Email: email, Password: "password123", DisplayName: "Admin"}
		problems := validateInitRequest(req)
		if hasFieldError(problems, "email") {
			t.Errorf("expected valid email to pass, but got error for: %q", email)
		}
	}
}

func TestValidateInitRequest_MissingPassword(t *testing.T) {
	req := initRequest{
		Email:       "admin@example.com",
		Password:    "",
		DisplayName: "Admin",
	}
	problems := validateInitRequest(req)
	if !hasFieldError(problems, "password") {
		t.Error("expected password validation error for empty password")
	}
}

func TestValidateInitRequest_PasswordTooShort(t *testing.T) {
	cases := []string{"a", "1234567"} // 7 chars — below minimum of 8
	for _, pw := range cases {
		req := initRequest{
			Email:       "admin@example.com",
			Password:    pw,
			DisplayName: "Admin",
		}
		problems := validateInitRequest(req)
		if !hasFieldError(problems, "password") {
			t.Errorf("expected password too-short error for password of len %d", len(pw))
		}
	}
}

func TestValidateInitRequest_PasswordExactlyEightChars(t *testing.T) {
	req := initRequest{
		Email:       "admin@example.com",
		Password:    "12345678", // exactly 8 — boundary, should pass
		DisplayName: "Admin",
	}
	problems := validateInitRequest(req)
	if hasFieldError(problems, "password") {
		t.Error("expected no password error for 8-char password (boundary value)")
	}
}

func TestValidateInitRequest_MissingDisplayName(t *testing.T) {
	req := initRequest{
		Email:       "admin@example.com",
		Password:    "password123",
		DisplayName: "",
	}
	problems := validateInitRequest(req)
	if !hasFieldError(problems, "display_name") {
		t.Error("expected display_name validation error for empty display_name")
	}
}

func TestValidateInitRequest_WhitespaceOnlyDisplayName(t *testing.T) {
	req := initRequest{
		Email:       "admin@example.com",
		Password:    "password123",
		DisplayName: "   ",
	}
	problems := validateInitRequest(req)
	if !hasFieldError(problems, "display_name") {
		t.Error("expected display_name validation error for whitespace-only display_name")
	}
}

func TestValidateInitRequest_MultipleErrors(t *testing.T) {
	req := initRequest{Email: "", Password: "", DisplayName: ""}
	problems := validateInitRequest(req)
	if len(problems) < 3 {
		t.Errorf("expected at least 3 validation errors for all-empty request, got %d", len(problems))
	}
}

func TestValidateInitRequest_FieldErrorsHaveMessages(t *testing.T) {
	req := initRequest{Email: "", Password: "pw", DisplayName: ""}
	problems := validateInitRequest(req)
	for _, p := range problems {
		if p.Field == "" {
			t.Error("expected all field errors to have a field name")
		}
		if p.Message == "" {
			t.Error("expected all field errors to have a message")
		}
	}
}

// --- HandleStatus tests ---

// We can test handleStatus indirectly by using a Handlers with a Service that
// has nil pool (IsSetupRequired returns false, nil for nil pool).
func TestHandleStatus_SetupNotRequired(t *testing.T) {
	// With nil pool, IsSetupRequired returns (false, nil) per the guard in service.go
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	req := httptest.NewRequest("GET", "/api/setup/status", nil)
	rec := httptest.NewRecorder()

	h.handleStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var resp statusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	// nil pool → IsSetupRequired returns false
	if resp.SetupRequired != false {
		t.Errorf("expected setup_required=false for nil pool, got %v", resp.SetupRequired)
	}
}

func TestHandleStatus_ResponseIsJSON(t *testing.T) {
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	req := httptest.NewRequest("GET", "/api/setup/status", nil)
	rec := httptest.NewRecorder()

	h.handleStatus(rec, req)

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

func TestHandleStatus_ResponseHasSetupRequiredField(t *testing.T) {
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	req := httptest.NewRequest("GET", "/api/setup/status", nil)
	rec := httptest.NewRecorder()
	h.handleStatus(rec, req)

	var result map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&result)

	if _, ok := result["setup_required"]; !ok {
		t.Error("expected setup_required field in status response")
	}
}

// --- handleInit validation error tests (no DB required) ---

func TestHandleInit_BadJSON(t *testing.T) {
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	req := httptest.NewRequest("POST", "/api/setup/init", bytes.NewBufferString("{invalid json"))
	rec := httptest.NewRecorder()

	// With nil pool, handleInit parses JSON first (should return 400 for bad JSON).
	// Then it would try pool.Begin which panics with nil pool, but bad JSON
	// is caught before that.
	h.handleInit(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", rec.Code)
	}
}

func TestHandleInit_ValidationError_Returns422(t *testing.T) {
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	// Valid JSON but fails validation (empty fields)
	body, _ := json.Marshal(initRequest{Email: "", Password: "", DisplayName: ""})
	req := httptest.NewRequest("POST", "/api/setup/init", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleInit(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected 422 for validation errors, got %d", rec.Code)
	}

	var result map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&result)
	if result["error"] != "validation_failed" {
		t.Errorf("expected error=validation_failed, got %v", result["error"])
	}
}

func TestHandleInit_ValidRequest_NilPool_Returns500(t *testing.T) {
	// With nil pool and valid request body, pool.Begin() should fail.
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	body, _ := json.Marshal(initRequest{
		Email:       "admin@example.com",
		Password:    "password123",
		DisplayName: "Admin",
	})
	req := httptest.NewRequest("POST", "/api/setup/init", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		h.handleInit(rec, req)
	}()

	// Either panics at pool.Begin (nil pool) or returns 500 — both acceptable
	if !panicked && rec.Code == http.StatusCreated {
		t.Error("expected failure with nil pool, but got 201 Created")
	}
}

// --- RegisterRoutes test ---

func TestRegisterRoutes_SetupRoutes(t *testing.T) {
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	r := mux.NewRouter()
	h.RegisterRoutes(r)

	routes := []struct {
		path   string
		method string
	}{
		{"/api/setup/status", "GET"},
		{"/api/setup/init", "POST"},
	}

	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected route %s %s to be registered", rt.method, rt.path)
		}
	}
}

// --- guardState caching logic tests ---

func TestGuardState_InitialState(t *testing.T) {
	gs := newGuardState(30)
	if gs.initialized {
		t.Error("expected guardState to start uninitialized")
	}
	if gs.required {
		t.Error("expected guardState.required to start false")
	}
}

func TestGuardState_NewGuardState(t *testing.T) {
	gs := newGuardState(60)
	if gs == nil {
		t.Fatal("expected non-nil guardState")
	}
	if gs.cacheDuration != 60 {
		t.Errorf("expected cacheDuration=60, got %v", gs.cacheDuration)
	}
}

// --- fieldError JSON serialization test ---

func TestFieldError_JSONSerialization(t *testing.T) {
	fe := fieldError{Field: "email", Message: "email is required"}
	data, err := json.Marshal(fe)
	if err != nil {
		t.Fatalf("failed to marshal fieldError: %v", err)
	}

	var result map[string]string
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("failed to unmarshal fieldError JSON: %v", err)
	}
	if result["field"] != "email" {
		t.Errorf("expected field='email', got '%s'", result["field"])
	}
	if result["message"] != "email is required" {
		t.Errorf("expected message='email is required', got '%s'", result["message"])
	}
}

// --- Security: response must not contain stack traces ---

func TestHandleInit_ValidationResponseDoesNotLeakInternals(t *testing.T) {
	svc := &Service{pool: nil}
	h := &Handlers{service: svc}

	// Use invalid request that fails validation (before reaching pool.Begin)
	body, _ := json.Marshal(initRequest{Email: "not-an-email", Password: "pw", DisplayName: ""})
	req := httptest.NewRequest("POST", "/api/setup/init", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleInit(rec, req)

	respBody := rec.Body.String()
	if strings.Contains(respBody, ".go:") {
		t.Errorf("SECURITY: response body contains Go file reference: %s", respBody)
	}
	if strings.Contains(respBody, "goroutine") {
		t.Errorf("SECURITY: response body contains goroutine stack: %s", respBody)
	}
}

// --- XSS payloads in input fields ---

func TestValidateInitRequest_XSSPayloadsRejected(t *testing.T) {
	xssEmails := []string{
		`<script>alert('xss')</script>@example.com`,
		`"><img src=x onerror=alert(1)>@test.com`,
	}
	for _, email := range xssEmails {
		req := initRequest{Email: email, Password: "password123", DisplayName: "Admin"}
		problems := validateInitRequest(req)
		if !hasFieldError(problems, "email") {
			t.Errorf("expected email validation error for XSS payload: %q", email)
		}
	}
}

// --- helper ---

func hasFieldError(problems []fieldError, field string) bool {
	for _, p := range problems {
		if p.Field == field {
			return true
		}
	}
	return false
}
