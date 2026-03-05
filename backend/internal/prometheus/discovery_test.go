package prometheus

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDiscoverInstances_ByLabel(t *testing.T) {
	cs := fake.NewClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "prometheus-server",
				Namespace: "monitoring",
				Labels:    map[string]string{"app.kubernetes.io/name": "prometheus"},
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{
					{Name: "http", Port: 9090, TargetPort: intstr.FromInt(9090)},
				},
			},
		},
	)

	instances, err := DiscoverInstances(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 1 {
		t.Fatalf("expected 1 instance, got %d", len(instances))
	}
	inst := instances[0]
	if inst.Namespace != "monitoring" {
		t.Errorf("expected namespace 'monitoring', got %q", inst.Namespace)
	}
	if inst.ServiceName != "prometheus-server" {
		t.Errorf("expected service 'prometheus-server', got %q", inst.ServiceName)
	}
	if inst.Port != 9090 {
		t.Errorf("expected port 9090, got %d", inst.Port)
	}
	if inst.PortName != "http" {
		t.Errorf("expected portName 'http', got %q", inst.PortName)
	}
}

func TestDiscoverInstances_ByWellKnownName(t *testing.T) {
	cs := fake.NewClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "prometheus-operated",
				Namespace: "monitoring",
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{
					{Name: "web", Port: 9090, TargetPort: intstr.FromInt(9090)},
				},
			},
		},
	)

	instances, err := DiscoverInstances(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 1 {
		t.Fatalf("expected 1 instance, got %d", len(instances))
	}
	if instances[0].ServiceName != "prometheus-operated" {
		t.Errorf("expected service 'prometheus-operated', got %q", instances[0].ServiceName)
	}
}

func TestDiscoverInstances_NoInstances(t *testing.T) {
	cs := fake.NewClientset()

	instances, err := DiscoverInstances(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 0 {
		t.Errorf("expected 0 instances, got %d", len(instances))
	}
}

func TestDiscoverInstances_Deduplicated(t *testing.T) {
	// A service that matches both label search and well-known name
	cs := fake.NewClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "prometheus",
				Namespace: "monitoring",
				Labels:    map[string]string{"app": "prometheus"},
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{
					{Name: "http", Port: 9090, TargetPort: intstr.FromInt(9090)},
				},
			},
		},
	)

	instances, err := DiscoverInstances(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 1 {
		t.Errorf("expected 1 deduplicated instance, got %d", len(instances))
	}
}

func TestDiscoverInstances_MultipleInstances(t *testing.T) {
	cs := fake.NewClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "prometheus-main",
				Namespace: "monitoring",
				Labels:    map[string]string{"app.kubernetes.io/name": "prometheus"},
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{
					{Name: "web", Port: 9090, TargetPort: intstr.FromInt(9090)},
				},
			},
		},
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "prometheus-secondary",
				Namespace: "observability",
				Labels:    map[string]string{"app": "prometheus"},
			},
			Spec: corev1.ServiceSpec{
				Ports: []corev1.ServicePort{
					{Name: "http", Port: 9091, TargetPort: intstr.FromInt(9091)},
				},
			},
		},
	)

	instances, err := DiscoverInstances(context.Background(), cs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instances) != 2 {
		t.Fatalf("expected 2 instances, got %d", len(instances))
	}
}

func TestFindPrometheusPort(t *testing.T) {
	tests := []struct {
		name     string
		ports    []corev1.ServicePort
		wantPort int32
		wantName string
	}{
		{
			name:     "prefer http port",
			ports:    []corev1.ServicePort{{Name: "metrics", Port: 8080}, {Name: "http", Port: 9090}},
			wantPort: 9090,
			wantName: "http",
		},
		{
			name:     "prefer web port",
			ports:    []corev1.ServicePort{{Name: "web", Port: 9090}, {Name: "grpc", Port: 10901}},
			wantPort: 9090,
			wantName: "web",
		},
		{
			name:     "fallback to first port",
			ports:    []corev1.ServicePort{{Name: "metrics", Port: 8080}},
			wantPort: 8080,
			wantName: "metrics",
		},
		{
			name:     "no ports defaults to 9090",
			ports:    nil,
			wantPort: 9090,
			wantName: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			port, name := findPrometheusPort(tt.ports)
			if port != tt.wantPort {
				t.Errorf("expected port %d, got %d", tt.wantPort, port)
			}
			if name != tt.wantName {
				t.Errorf("expected name %q, got %q", tt.wantName, name)
			}
		})
	}
}
