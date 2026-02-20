package helm

import (
	"testing"
)

func TestHelmPluginID(t *testing.T) {
	p := New()
	if p.ID() != "helm" {
		t.Errorf("expected ID 'helm', got '%s'", p.ID())
	}
}

func TestManifest(t *testing.T) {
	p := New()
	m := p.Manifest()

	if m.ID != "helm" {
		t.Errorf("expected manifest ID 'helm', got '%s'", m.ID)
	}
	if m.Name != "Helm Releases" {
		t.Errorf("expected manifest Name 'Helm Releases', got '%s'", m.Name)
	}
	if m.Version != "1.0.0" {
		t.Errorf("expected manifest Version '1.0.0', got '%s'", m.Version)
	}
	if len(m.Backend.Watchers) != 0 {
		t.Errorf("expected 0 watchers (helm uses SDK, not CRD watches), got %d", len(m.Backend.Watchers))
	}
	if len(m.Frontend.Navigation) != 1 {
		t.Errorf("expected 1 nav item, got %d", len(m.Frontend.Navigation))
	}
	if m.Frontend.Navigation[0].Label != "Helm" {
		t.Errorf("expected nav label 'Helm', got '%s'", m.Frontend.Navigation[0].Label)
	}
	if len(m.Frontend.Routes) != 2 {
		t.Errorf("expected 2 frontend routes, got %d", len(m.Frontend.Routes))
	}
	if len(m.Frontend.Widgets) != 1 {
		t.Errorf("expected 1 widget, got %d", len(m.Frontend.Widgets))
	}
	if m.Frontend.Widgets[0].ID != "helm-releases-count" {
		t.Errorf("expected widget ID 'helm-releases-count', got '%s'", m.Frontend.Widgets[0].ID)
	}
	if len(m.Permissions) != 2 {
		t.Errorf("expected 2 permissions, got %d", len(m.Permissions))
	}
}

func TestSimpleRESTClientGetter(t *testing.T) {
	getter := &simpleRESTClientGetter{
		namespace: "test-ns",
	}

	loader := getter.ToRawKubeConfigLoader()
	if loader == nil {
		t.Fatal("expected non-nil client config loader")
	}

	ns, _, err := loader.Namespace()
	if err != nil {
		t.Fatalf("unexpected error getting namespace: %v", err)
	}
	if ns != "test-ns" {
		t.Errorf("expected namespace 'test-ns', got '%s'", ns)
	}
}

func TestSimpleRESTClientGetterDefaultNamespace(t *testing.T) {
	getter := &simpleRESTClientGetter{
		namespace: "",
	}

	loader := getter.ToRawKubeConfigLoader()
	ns, _, err := loader.Namespace()
	if err != nil {
		t.Fatalf("unexpected error getting namespace: %v", err)
	}
	if ns != "default" {
		t.Errorf("expected default namespace 'default', got '%s'", ns)
	}
}
