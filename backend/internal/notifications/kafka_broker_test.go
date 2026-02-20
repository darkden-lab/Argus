package notifications

import (
	"testing"
)

// KafkaBroker tests verify interface compliance and configuration validation.
// Integration tests with a real Kafka cluster are excluded from unit tests.

func TestKafkaBroker_ImplementsInterface(t *testing.T) {
	// Compile-time check that KafkaBroker implements MessageBroker.
	var _ MessageBroker = (*KafkaBroker)(nil)
}

func TestNewKafkaBroker_RequiresBrokers(t *testing.T) {
	_, err := NewKafkaBroker(KafkaConfig{})
	if err == nil {
		t.Error("expected error for empty brokers list")
	}
}

func TestNewKafkaBroker_DefaultConsumerGroup(t *testing.T) {
	broker, err := NewKafkaBroker(KafkaConfig{
		Brokers: []string{"localhost:9092"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer broker.Close()

	if broker.config.ConsumerGroup != "k8s-dashboard-notifications" {
		t.Errorf("expected default consumer group, got %s", broker.config.ConsumerGroup)
	}
}

func TestNewKafkaBroker_CustomConsumerGroup(t *testing.T) {
	broker, err := NewKafkaBroker(KafkaConfig{
		Brokers:       []string{"localhost:9092"},
		ConsumerGroup: "my-group",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer broker.Close()

	if broker.config.ConsumerGroup != "my-group" {
		t.Errorf("expected consumer group 'my-group', got %s", broker.config.ConsumerGroup)
	}
}

func TestKafkaBroker_ClosePreventsFurtherUse(t *testing.T) {
	broker, err := NewKafkaBroker(KafkaConfig{
		Brokers: []string{"localhost:9092"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	broker.Close()

	if err := broker.Publish("test", Event{}); err == nil {
		t.Error("expected error publishing after close")
	}

	if _, err := broker.Subscribe("test", func(e Event) {}); err == nil {
		t.Error("expected error subscribing after close")
	}
}

func TestKafkaBroker_DoubleCloseIsNoop(t *testing.T) {
	broker, err := NewKafkaBroker(KafkaConfig{
		Brokers: []string{"localhost:9092"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := broker.Close(); err != nil {
		t.Fatalf("first close failed: %v", err)
	}
	if err := broker.Close(); err != nil {
		t.Fatalf("second close failed: %v", err)
	}
}
