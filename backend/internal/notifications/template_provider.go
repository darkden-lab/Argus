package notifications

import (
	"context"
	"log"

	"github.com/darkden-lab/argus/backend/internal/notifications/channels"
)

// DBTemplateProvider implements channels.TemplateProvider by loading templates
// from the notification_templates database table via TemplateStore.
type DBTemplateProvider struct {
	store *TemplateStore
}

// Ensure DBTemplateProvider implements TemplateProvider at compile time.
var _ channels.TemplateProvider = (*DBTemplateProvider)(nil)

// NewDBTemplateProvider creates a new DBTemplateProvider.
func NewDBTemplateProvider(store *TemplateStore) *DBTemplateProvider {
	return &DBTemplateProvider{store: store}
}

// GetSubjectTemplate returns the default subject template for the given channel type.
func (p *DBTemplateProvider) GetSubjectTemplate(channelType string) string {
	t, err := p.store.GetDefaultTemplate(context.Background(), channelType)
	if err != nil {
		log.Printf("notifications: failed to load default subject template for %s: %v", channelType, err)
		return ""
	}
	return t.SubjectTemplate
}

// GetBodyTemplate returns the default body template for the given channel type.
func (p *DBTemplateProvider) GetBodyTemplate(channelType string) string {
	t, err := p.store.GetDefaultTemplate(context.Background(), channelType)
	if err != nil {
		log.Printf("notifications: failed to load default body template for %s: %v", channelType, err)
		return ""
	}
	return t.BodyTemplate
}
