package notifications

import (
	"log"
	"strings"

	"github.com/darkden-lab/argus/backend/internal/config"
)

// NewBroker creates a MessageBroker based on the application configuration.
// If KAFKA_BROKERS is set, it returns a KafkaBroker; otherwise it falls back
// to an InMemoryBroker suitable for single-node deployments.
func NewBroker(cfg *config.Config) (MessageBroker, error) {
	if cfg.KafkaBrokers != "" {
		brokers := strings.Split(cfg.KafkaBrokers, ",")
		log.Printf("notifications: using KafkaBroker with brokers=%v group=%s", brokers, cfg.KafkaConsumerGroup)
		return NewKafkaBroker(KafkaConfig{
			Brokers:       brokers,
			ConsumerGroup: cfg.KafkaConsumerGroup,
		})
	}

	log.Println("notifications: using InMemoryBroker (KAFKA_BROKERS not set)")
	return NewInMemoryBroker(), nil
}
