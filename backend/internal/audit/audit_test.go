package audit

import (
	"testing"
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
	handlers := NewHandlers(store)
	if handlers == nil {
		t.Fatal("expected non-nil handlers")
	}
}
