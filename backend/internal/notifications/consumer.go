package notifications

import (
	"context"
	"log"
)

// AllTopics lists all notification topics that the consumer subscribes to.
var AllTopics = []string{
	TopicClusterHealth,
	TopicClusterAdded,
	TopicClusterRemoved,
	TopicWorkloadCrash,
	TopicWorkloadScale,
	TopicWorkloadDeploy,
	TopicNodeReady,
	TopicNodeNotReady,
	TopicSecurityRBAC,
	TopicSecuritySecret,
	TopicPluginInstall,
	TopicPluginError,
	TopicAuditAction,
}

// Consumer subscribes to all notification topics on the broker and routes
// received events to the Router for processing. Run it in a goroutine.
type Consumer struct {
	broker MessageBroker
	router *Router
	ctx    context.Context
	cancel context.CancelFunc
}

// NewConsumer creates a new Consumer.
func NewConsumer(broker MessageBroker, router *Router) *Consumer {
	ctx, cancel := context.WithCancel(context.Background())
	return &Consumer{
		broker: broker,
		router: router,
		ctx:    ctx,
		cancel: cancel,
	}
}

// Start subscribes to all topics and begins routing events. This method
// returns immediately; event handling runs asynchronously via the broker's
// subscription mechanism.
func (c *Consumer) Start() error {
	for _, topic := range AllTopics {
		t := topic // capture for closure
		_, err := c.broker.Subscribe(t, func(event Event) {
			c.router.Route(c.ctx, event)
		})
		if err != nil {
			return err
		}
		log.Printf("notifications: consumer subscribed to %s", t)
	}
	return nil
}

// Stop cancels the consumer's context. For KafkaBroker, call broker.Close()
// separately to stop the underlying consumers.
func (c *Consumer) Stop() {
	c.cancel()
}
