package notifications

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNotification_JSONSerialization(t *testing.T) {
	n := Notification{
		ID:           "uuid-1",
		UserID:       "user-1",
		Category:     "cluster",
		Severity:     "warning",
		Title:        "Cluster unhealthy",
		Body:         "prod-1 is unreachable",
		Metadata:     json.RawMessage(`{"cluster_id":"abc"}`),
		Read:         false,
		ChannelsSent: []string{"email", "slack"},
		CreatedAt:    time.Now(),
	}

	data, err := json.Marshal(n)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded Notification
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.ID != n.ID {
		t.Errorf("expected ID %s, got %s", n.ID, decoded.ID)
	}
	if decoded.Title != n.Title {
		t.Errorf("expected title %s, got %s", n.Title, decoded.Title)
	}
	if decoded.Read != false {
		t.Error("expected read=false")
	}
	if len(decoded.ChannelsSent) != 2 {
		t.Errorf("expected 2 channels, got %d", len(decoded.ChannelsSent))
	}
}

func TestPreference_JSONSerialization(t *testing.T) {
	chID := "channel-1"
	p := Preference{
		ID:        "pref-1",
		UserID:    "user-1",
		Category:  "workload",
		ChannelID: &chID,
		Frequency: "realtime",
		Enabled:   true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	data, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded Preference
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if decoded.UserID != p.UserID {
		t.Errorf("expected user_id %s, got %s", p.UserID, decoded.UserID)
	}
	if decoded.Frequency != "realtime" {
		t.Errorf("expected frequency realtime, got %s", decoded.Frequency)
	}
	if decoded.ChannelID == nil || *decoded.ChannelID != chID {
		t.Errorf("expected channel_id %s", chID)
	}
}

func TestPreference_NilChannelID(t *testing.T) {
	p := Preference{
		ID:        "pref-2",
		UserID:    "user-1",
		Category:  "security",
		ChannelID: nil,
		Frequency: "daily",
		Enabled:   true,
	}

	data, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var m map[string]interface{}
	json.Unmarshal(data, &m)
	if _, ok := m["channel_id"]; ok {
		t.Error("expected channel_id to be omitted when nil")
	}
}

func TestChannelConfig_JSONOmitsEncryptedConfig(t *testing.T) {
	ch := ChannelConfig{
		ID:        "ch-1",
		Type:      "email",
		Name:      "Corp email",
		ConfigEnc: []byte("encrypted-bytes"),
		Enabled:   true,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	data, err := json.Marshal(ch)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var m map[string]interface{}
	json.Unmarshal(data, &m)

	if _, ok := m["config_enc"]; ok {
		t.Error("expected config_enc to be omitted from JSON output")
	}
	if m["type"] != "email" {
		t.Errorf("expected type 'email', got %v", m["type"])
	}
}

func TestNotificationListParams_Defaults(t *testing.T) {
	params := NotificationListParams{
		UserID: "user-1",
	}

	if params.Limit != 0 {
		t.Errorf("expected default limit 0 (handled by store), got %d", params.Limit)
	}
	if params.Category != "" {
		t.Errorf("expected empty category, got %s", params.Category)
	}
	if params.ReadOnly != nil {
		t.Error("expected nil ReadOnly by default")
	}
}

func TestNewNotificationStore_Constructor(t *testing.T) {
	store := NewNotificationStore(nil)
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestNewPreferencesStore_Constructor(t *testing.T) {
	store := NewPreferencesStore(nil)
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestNewChannelStore_Constructor(t *testing.T) {
	store := NewChannelStore(nil)
	if store == nil {
		t.Fatal("expected non-nil store")
	}
}
