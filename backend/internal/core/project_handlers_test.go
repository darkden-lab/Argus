package core

import (
	"testing"
)

func TestSplitProjects(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"frontend,backend", []string{"frontend", "backend"}},
		{"single", []string{"single"}},
		{"", []string{}},
		{"  frontend , backend ", []string{"frontend", "backend"}},
		{" , ", []string{}},
		{"a,b,c,d", []string{"a", "b", "c", "d"}},
	}
	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result := splitProjects(tc.input)
			if len(result) != len(tc.expected) {
				t.Errorf("splitProjects(%q) = %v, want %v", tc.input, result, tc.expected)
				return
			}
			for i, v := range result {
				if v != tc.expected[i] {
					t.Errorf("splitProjects(%q)[%d] = %q, want %q", tc.input, i, v, tc.expected[i])
				}
			}
		})
	}
}

func TestContainsProject(t *testing.T) {
	tests := []struct {
		label    string
		project  string
		expected bool
	}{
		{"frontend,backend", "frontend", true},
		{"frontend,backend", "backend", true},
		{"frontend,backend", "monitoring", false},
		{"single", "single", true},
		{"", "anything", false},
		{" frontend , backend ", "frontend", true},
	}
	for _, tc := range tests {
		t.Run(tc.label+"_"+tc.project, func(t *testing.T) {
			result := containsProject(tc.label, tc.project)
			if result != tc.expected {
				t.Errorf("containsProject(%q, %q) = %v, want %v", tc.label, tc.project, result, tc.expected)
			}
		})
	}
}

func TestAppendUnique(t *testing.T) {
	slice := []string{"a", "b"}
	result := appendUnique(slice, "c")
	if len(result) != 3 {
		t.Errorf("expected 3 items, got %d", len(result))
	}
	result = appendUnique(result, "a")
	if len(result) != 3 {
		t.Errorf("expected 3 items after adding duplicate, got %d", len(result))
	}
}

func TestAppendUniqueEmpty(t *testing.T) {
	var slice []string
	result := appendUnique(slice, "first")
	if len(result) != 1 || result[0] != "first" {
		t.Errorf("expected [first], got %v", result)
	}
}

func TestUnstructuredInt64(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"replicas": int64(3),
		},
		"status": map[string]interface{}{
			"readyReplicas": float64(2),
		},
	}

	v, found, err := unstructuredInt64(obj, "spec", "replicas")
	if err != nil || !found || v != 3 {
		t.Errorf("expected (3, true, nil), got (%d, %v, %v)", v, found, err)
	}

	v, found, err = unstructuredInt64(obj, "status", "readyReplicas")
	if err != nil || !found || v != 2 {
		t.Errorf("expected (2, true, nil), got (%d, %v, %v)", v, found, err)
	}

	v, found, _ = unstructuredInt64(obj, "spec", "missing")
	if found {
		t.Errorf("expected not found for missing field, got (%d, %v)", v, found)
	}

	v, found, _ = unstructuredInt64(obj, "nonexistent", "field")
	if found {
		t.Errorf("expected not found for nonexistent path, got (%d, %v)", v, found)
	}
}
