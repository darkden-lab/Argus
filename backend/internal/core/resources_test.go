package core

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestGvrFromVars_CoreGroup(t *testing.T) {
	vars := map[string]string{
		"group":    "_",
		"version":  "v1",
		"resource": "pods",
	}
	gvr := gvrFromVars(vars)

	if gvr.Group != "" {
		t.Errorf("expected empty group for core resources, got %q", gvr.Group)
	}
	if gvr.Version != "v1" {
		t.Errorf("expected version v1, got %q", gvr.Version)
	}
	if gvr.Resource != "pods" {
		t.Errorf("expected resource pods, got %q", gvr.Resource)
	}
}

func TestGvrFromVars_NamedGroup(t *testing.T) {
	vars := map[string]string{
		"group":    "apps",
		"version":  "v1",
		"resource": "deployments",
	}
	gvr := gvrFromVars(vars)

	expected := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	if gvr != expected {
		t.Errorf("expected %v, got %v", expected, gvr)
	}
}

func TestGvrFromVars_BatchGroup(t *testing.T) {
	vars := map[string]string{
		"group":    "batch",
		"version":  "v1",
		"resource": "jobs",
	}
	gvr := gvrFromVars(vars)

	if gvr.Group != "batch" {
		t.Errorf("expected group batch, got %q", gvr.Group)
	}
	if gvr.Resource != "jobs" {
		t.Errorf("expected resource jobs, got %q", gvr.Resource)
	}
}

func TestNewResourceHandler(t *testing.T) {
	h := NewResourceHandler(nil)
	if h == nil {
		t.Fatal("expected non-nil ResourceHandler")
	}
}
