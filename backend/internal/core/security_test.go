package core

import (
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// --- Input Validation & Path Traversal Tests ---

// TestGvrFromVarsPathTraversal verifies that path traversal attempts in
// URL variables don't escape the expected resource scope.
func TestGvrFromVarsPathTraversal(t *testing.T) {
	traversalAttempts := []map[string]string{
		{"group": "../admin", "version": "v1", "resource": "pods"},
		{"group": "_", "version": "../../v1", "resource": "pods"},
		{"group": "_", "version": "v1", "resource": "../../../secrets"},
		{"group": "apps/../../core", "version": "v1", "resource": "pods"},
		{"group": "%2e%2e/admin", "version": "v1", "resource": "pods"},
		{"group": "_", "version": "v1", "resource": "pods%00.yaml"},
	}

	for _, vars := range traversalAttempts {
		gvr := gvrFromVars(vars)
		// The function should pass through values as-is (gorilla/mux handles URL decoding)
		// but the resulting GVR should not resolve to unexpected resources
		// This test verifies the function doesn't do any path manipulation
		if gvr.Resource != vars["resource"] {
			t.Errorf("gvrFromVars modified resource: got %q, want %q", gvr.Resource, vars["resource"])
		}
	}
}

// TestGvrFromVarsSpecialCharacters tests that special characters in variables
// are passed through without interpretation.
func TestGvrFromVarsSpecialCharacters(t *testing.T) {
	specialChars := []map[string]string{
		{"group": "_", "version": "v1", "resource": "pods;drop table users"},
		{"group": "_", "version": "v1", "resource": "pods' OR 1=1--"},
		{"group": "_", "version": "v1", "resource": "<script>alert(1)</script>"},
		{"group": "_", "version": "v1", "resource": "pods\x00hidden"},
	}

	for _, vars := range specialChars {
		gvr := gvrFromVars(vars)
		// gvrFromVars should not execute or interpret special characters
		if gvr.Resource != vars["resource"] {
			t.Errorf("gvrFromVars altered special chars: got %q, want %q", gvr.Resource, vars["resource"])
		}
	}
}

// TestGvrFromVarsEmptyValues tests behavior with empty values.
func TestGvrFromVarsEmptyValues(t *testing.T) {
	vars := map[string]string{
		"group":    "",
		"version":  "",
		"resource": "",
	}

	gvr := gvrFromVars(vars)
	expected := schema.GroupVersionResource{Group: "", Version: "", Resource: ""}
	if gvr != expected {
		t.Errorf("expected empty GVR, got %v", gvr)
	}
}

// TestGvrFromVarsUnderscoreConversion tests that only "_" maps to empty group.
func TestGvrFromVarsUnderscoreConversion(t *testing.T) {
	// "_" should become empty (core group)
	vars := map[string]string{"group": "_", "version": "v1", "resource": "pods"}
	gvr := gvrFromVars(vars)
	if gvr.Group != "" {
		t.Errorf("expected empty group for '_', got %q", gvr.Group)
	}

	// "__" should NOT become empty
	vars["group"] = "__"
	gvr = gvrFromVars(vars)
	if gvr.Group != "__" {
		t.Errorf("expected '__' to remain as-is, got %q", gvr.Group)
	}

	// " _" (with space) should NOT become empty
	vars["group"] = " _"
	gvr = gvrFromVars(vars)
	if gvr.Group != " _" {
		t.Errorf("expected ' _' to remain as-is, got %q", gvr.Group)
	}
}

// TestGvrFromVarsOversizedValues tests handling of extremely long values.
func TestGvrFromVarsOversizedValues(t *testing.T) {
	vars := map[string]string{
		"group":    strings.Repeat("A", 10000),
		"version":  strings.Repeat("B", 10000),
		"resource": strings.Repeat("C", 10000),
	}

	// Should not panic or crash
	gvr := gvrFromVars(vars)
	if gvr.Group != vars["group"] {
		t.Error("gvrFromVars failed on oversized group")
	}
}

// TestNewResourceHandlerNilManager tests that creating a handler with nil manager doesn't panic.
func TestNewResourceHandlerNilManager(t *testing.T) {
	h := NewResourceHandler(nil)
	if h == nil {
		t.Fatal("expected non-nil ResourceHandler")
	}
	if h.clusterMgr != nil {
		t.Error("expected nil clusterMgr")
	}
}
