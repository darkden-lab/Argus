package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

// KafkaConfig holds configuration for the Kafka broker.
type KafkaConfig struct {
	Brokers       []string // list of broker addresses
	ConsumerGroup string   // consumer group ID
}

// KafkaBroker implements MessageBroker using Apache Kafka via segmentio/kafka-go.
type KafkaBroker struct {
	config  KafkaConfig
	writer  *kafka.Writer
	mu      sync.Mutex
	readers map[string]*kafkaSubscription
	closed  bool
	ctx     context.Context
	cancel  context.CancelFunc
}

type kafkaSubscription struct {
	id      string
	reader  *kafka.Reader
	handler EventHandler
	cancel  context.CancelFunc
}

// NewKafkaBroker creates a new KafkaBroker. The broker starts a shared producer
// and creates per-subscription consumers. Call Close() to stop all consumers
// and the producer.
func NewKafkaBroker(config KafkaConfig) (*KafkaBroker, error) {
	if len(config.Brokers) == 0 {
		return nil, fmt.Errorf("at least one Kafka broker address is required")
	}
	if config.ConsumerGroup == "" {
		config.ConsumerGroup = "k8s-dashboard-notifications"
	}

	ctx, cancel := context.WithCancel(context.Background())

	writer := &kafka.Writer{
		Addr:         kafka.TCP(config.Brokers...),
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		Async:        false,
	}

	return &KafkaBroker{
		config:  config,
		writer:  writer,
		readers: make(map[string]*kafkaSubscription),
		ctx:     ctx,
		cancel:  cancel,
	}, nil
}

// Publish serializes the event to JSON and writes it to the Kafka topic.
func (b *KafkaBroker) Publish(topic string, event Event) error {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return fmt.Errorf("broker is closed")
	}
	b.mu.Unlock()

	value, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(event.ID),
		Value: value,
	}

	if err := b.writer.WriteMessages(b.ctx, msg); err != nil {
		return fmt.Errorf("write to kafka: %w", err)
	}
	return nil
}

// Subscribe creates a Kafka consumer for the given topic and invokes the
// handler for each message received. The consumer runs in a background
// goroutine until Close() is called.
func (b *KafkaBroker) Subscribe(topic string, handler EventHandler) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return "", fmt.Errorf("broker is closed")
	}

	id := uuid.New().String()

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  b.config.Brokers,
		Topic:    topic,
		GroupID:  b.config.ConsumerGroup,
		MinBytes: 1,
		MaxBytes: 10e6, // 10MB
		MaxWait:  500 * time.Millisecond,
	})

	subCtx, subCancel := context.WithCancel(b.ctx)

	sub := &kafkaSubscription{
		id:      id,
		reader:  reader,
		handler: handler,
		cancel:  subCancel,
	}

	b.readers[id] = sub

	go b.consumeLoop(subCtx, sub)

	return id, nil
}

// Close shuts down all consumers and the producer.
func (b *KafkaBroker) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return nil
	}

	b.closed = true
	b.cancel()

	var firstErr error

	for _, sub := range b.readers {
		sub.cancel()
		if err := sub.reader.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}

	if err := b.writer.Close(); err != nil && firstErr == nil {
		firstErr = err
	}

	return firstErr
}

func (b *KafkaBroker) consumeLoop(ctx context.Context, sub *kafkaSubscription) {
	for {
		msg, err := sub.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // context cancelled, shutting down
			}
			log.Printf("kafka consumer %s error: %v", sub.id, err)
			continue
		}

		var event Event
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("kafka consumer %s: unmarshal error: %v", sub.id, err)
			continue
		}

		sub.handler(event)
	}
}
