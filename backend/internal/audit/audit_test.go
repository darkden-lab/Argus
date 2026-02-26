package audit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func TestItoaSingleDigit(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{0, "0"},
		{1, "1"},
		{5, "5"},
		{9, "9"},
	}
	for _, tt := range tests {
		result := itoa(tt.input)
		if result != tt.expected {
			t.Errorf("itoa(%d) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestItoaMultiDigit(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{10, "10"},
		{42, "42"},
		{100, "100"},
		{255, "255"},
		{999, "999"},
		{1000, "1000"},
	}
	for _, tt := range tests {
		result := itoa(tt.input)
		if result != tt.expected {
			t.Errorf("itoa(%d) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestListParamsDefaults(t *testing.T) {
	params := ListParams{}
	if params.Limit != 0 {
		t.Errorf("expected default Limit 0, got %d", params.Limit)
	}
	if params.Offset != 0 {
		t.Errorf("expected default Offset 0, got %d", params.Offset)
	}
}

func TestNewStore(t *testing.T) {
	store := NewStore(nil)
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestNewHandlers(t *testing.T) {
	store := NewStore(nil)
	handlers := NewHandlers(store, nil)
	if handlers == nil {
		t.Fatal("expected non-nil handlers")
	}
}

func TestListParams_AllFields(t *testing.T) {
	params := ListParams{
		UserID:    "user-1",
		ClusterID: "cluster-1",
		Action:    "delete",
		FromDate:  "2025-01-01",
		ToDate:    "2025-12-31",
		Limit:     25,
		Offset:    10,
	}

	if params.UserID != "user-1" {
		t.Errorf("expected UserID 'user-1', got %q", params.UserID)
	}
	if params.ClusterID != "cluster-1" {
		t.Errorf("expected ClusterID 'cluster-1', got %q", params.ClusterID)
	}
	if params.Action != "delete" {
		t.Errorf("expected Action 'delete', got %q", params.Action)
	}
	if params.Limit != 25 {
		t.Errorf("expected Limit 25, got %d", params.Limit)
	}
	if params.Offset != 10 {
		t.Errorf("expected Offset 10, got %d", params.Offset)
	}
}

func TestEntry_JSONSerialization(t *testing.T) {
	details := json.RawMessage(`{"method":"DELETE","path":"/api/clusters/1"}`)
	uid := "user-123"
	cid := "cluster-456"
	entry := Entry{
		ID:        "entry-1",
		UserID:    &uid,
		ClusterID: &cid,
		Action:    "delete /api/clusters/1",
		Resource:  "/api/clusters/1",
		Details:   details,
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded Entry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.ID != "entry-1" {
		t.Errorf("expected ID 'entry-1', got %q", decoded.ID)
	}
	if *decoded.UserID != "user-123" {
		t.Errorf("expected UserID 'user-123', got %q", *decoded.UserID)
	}
	if decoded.Action != "delete /api/clusters/1" {
		t.Errorf("expected Action 'delete /api/clusters/1', got %q", decoded.Action)
	}
}

func TestEntry_NilOptionalFields(t *testing.T) {
	entry := Entry{
		ID:       "entry-2",
		Action:   "post /api/test",
		Resource: "/api/test",
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded Entry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.UserID != nil {
		t.Error("expected nil UserID")
	}
	if decoded.ClusterID != nil {
		t.Error("expected nil ClusterID")
	}
}

func TestHandlers_RegisterRoutes(t *testing.T) {
	store := NewStore(nil)
	h := NewHandlers(store, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	// Verify the route exists by creating a request
	req := httptest.NewRequest("GET", "/api/audit-log", nil)
	match := &mux.RouteMatch{}
	if !r.Match(req, match) {
		t.Error("expected /api/audit-log route to be registered")
	}
}

func TestStatusRecorder_CapturesStatusCode(t *testing.T) {
	tests := []struct {
		name   string
		status int
	}{
		{"200 OK", http.StatusOK},
		{"201 Created", http.StatusCreated},
		{"400 Bad Request", http.StatusBadRequest},
		{"500 Internal Server Error", http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			rec.WriteHeader(tt.status)

			if rec.status != tt.status {
				t.Errorf("expected status %d, got %d", tt.status, rec.status)
			}
		})
	}
}

func TestStatusRecorder_DefaultStatus(t *testing.T) {
	w := httptest.NewRecorder()
	rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

	// Without calling WriteHeader, status should be the default
	if rec.status != http.StatusOK {
		t.Errorf("expected default status 200, got %d", rec.status)
	}
}

func TestMiddleware_SkipsGetRequests(t *testing.T) {
	store := NewStore(nil)
	mw := Middleware(store)

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/clusters", nil)
	rec := httptest.NewRecorder()

	// Should not panic even with nil pool - GET requests are skipped
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestMiddleware_SkipsGetMethods(t *testing.T) {
	methods := []string{"GET", "HEAD", "OPTIONS"}
	store := NewStore(nil)
	mw := Middleware(store)

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequest(method, "/api/test", nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("expected status 200 for %s, got %d", method, rec.Code)
			}
		})
	}
}

func TestMiddleware_SkipsFailedWrites(t *testing.T) {
	store := NewStore(nil)
	mw := Middleware(store)

	// Handler returns 400, so audit should be skipped
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))

	req := httptest.NewRequest("POST", "/api/clusters", nil)
	rec := httptest.NewRecorder()

	// Should not panic - the 400 status means no audit insert attempted
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}
