# Implementation Plan: Notifications System (Kafka)

**Feature:** Sistema de notificaciones asincronas con Kafka
**Design doc:** ../2026-02-20-features-expansion-design.md#feature-1
**Date:** 2026-02-20
**Status:** Pendiente
**Priority:** 1 (primera feature a implementar)

---

## Phase 1: Message Broker Interface + InMemory Implementation

### Task 1.1: MessageBroker interface and InMemoryBroker
**Files to create:**
- `backend/internal/notifications/broker.go` - MessageBroker interface (Publish, Subscribe, Close)
- `backend/internal/notifications/inmemory_broker.go` - InMemoryBroker implementation using Go channels
- `backend/internal/notifications/event.go` - Event, EventHandler types, topic constants
- `backend/internal/notifications/inmemory_broker_test.go` - Tests: publish/subscribe, multiple subscribers, topic filtering

**Acceptance criteria:**
- Interface defined with Publish, Subscribe, Close
- InMemoryBroker passes all tests
- Events have: ID, Topic, Category, Title, Body, Metadata, Timestamp

### Task 1.2: KafkaBroker implementation
**Files to create:**
- `backend/internal/notifications/kafka_broker.go` - KafkaBroker using segmentio/kafka-go (producer + consumer group)
- `backend/internal/notifications/kafka_broker_test.go` - Tests with mock/interface verification

**Dependencies:** Task 1.1
**Go dependency:** `github.com/segmentio/kafka-go`

**Acceptance criteria:**
- KafkaBroker implements MessageBroker interface
- Configurable via KAFKA_BROKERS, KAFKA_CONSUMER_GROUP env vars
- Graceful shutdown (close producer/consumers)

### Task 1.3: Broker factory and config integration
**Files to modify:**
- `backend/internal/config/config.go` - Add Kafka config fields
- `backend/internal/notifications/factory.go` - NewBroker(cfg) returns KafkaBroker if configured, InMemoryBroker otherwise

**Dependencies:** Tasks 1.1, 1.2

---

## Phase 2: Database + Preferences

### Task 2.1: Notification database tables and migrations
**Files to create:**
- `backend/migrations/002_notifications.up.sql` - notification_channels, notification_preferences, notifications tables
- `backend/migrations/002_notifications.down.sql` - Drop tables

**Acceptance criteria:**
- Three tables created with proper indexes
- Foreign keys to users table
- notification_channels.config_enc uses BYTEA for AES-256

### Task 2.2: Notification store and preferences CRUD
**Files to create:**
- `backend/internal/notifications/store.go` - NotificationStore: Insert, List, MarkRead, MarkAllRead, GetUnreadCount
- `backend/internal/notifications/preferences.go` - PreferencesStore: Get, Set, GetByUser, GetByCategory
- `backend/internal/notifications/channels_store.go` - ChannelStore: Create, List, Update, Delete (admin)
- `backend/internal/notifications/store_test.go` - Tests

**Dependencies:** Task 2.1

---

## Phase 3: Notification Channels

### Task 3.1: Email channel
**Files to create:**
- `backend/internal/notifications/channels/channel.go` - Channel interface (Send, Name, Type)
- `backend/internal/notifications/channels/email.go` - SMTP + SendGrid support
- `backend/internal/notifications/channels/email_test.go` - Tests

### Task 3.2: Teams and Slack webhook channels
**Files to create:**
- `backend/internal/notifications/channels/teams.go` - MS Teams Incoming Webhook (Adaptive Cards format)
- `backend/internal/notifications/channels/slack.go` - Slack Incoming Webhook (Block Kit format)
- `backend/internal/notifications/channels/teams_test.go`
- `backend/internal/notifications/channels/slack_test.go`

### Task 3.3: Telegram and generic webhook channels
**Files to create:**
- `backend/internal/notifications/channels/telegram.go` - Telegram Bot API
- `backend/internal/notifications/channels/webhook.go` - Generic HTTP POST with configurable payload template
- `backend/internal/notifications/channels/telegram_test.go`
- `backend/internal/notifications/channels/webhook_test.go`

---

## Phase 4: Producer, Consumer, Router

### Task 4.1: EventProducer - System event to broker
**Files to create:**
- `backend/internal/notifications/producer.go` - EventProducer: hooks into K8s watches, audit middleware, health checks. Publishes categorized events to broker topics.

**Files to modify:**
- `backend/internal/ws/hub.go` - Add hook point for EventProducer on watch events
- `backend/cmd/server/main.go` - Wire EventProducer

**Dependencies:** Phase 1, Phase 2

### Task 4.2: NotificationRouter and Consumer
**Files to create:**
- `backend/internal/notifications/router.go` - Routes events to channels based on user preferences
- `backend/internal/notifications/consumer.go` - Goroutine consumer: subscribes to all topics, passes events to router
- `backend/internal/notifications/consumer_test.go`

**Dependencies:** Tasks 4.1, Phase 3

### Task 4.3: Digest aggregator
**Files to create:**
- `backend/internal/notifications/digest.go` - Cron-like goroutine that aggregates events and sends daily/weekly digest emails
- `backend/internal/notifications/digest_test.go`

**Dependencies:** Task 4.2

---

## Phase 5: API Handlers

### Task 5.1: Notification REST API
**Files to create:**
- `backend/internal/notifications/handlers.go` - REST endpoints:
  - GET /api/notifications - List user notifications (paginated, filterable)
  - GET /api/notifications/unread-count - Unread count for badge
  - PUT /api/notifications/:id/read - Mark as read
  - PUT /api/notifications/read-all - Mark all read
  - GET /api/notifications/preferences - Get user preferences
  - PUT /api/notifications/preferences - Update preferences
  - GET /api/notifications/channels - List configured channels (admin)
  - POST /api/notifications/channels - Add channel config (admin)
  - PUT /api/notifications/channels/:id - Update channel (admin)
  - DELETE /api/notifications/channels/:id - Remove channel (admin)
  - POST /api/notifications/channels/:id/test - Send test notification (admin)

**Files to modify:**
- `backend/cmd/server/main.go` - Wire notification routes

**Dependencies:** Phase 4

---

## Phase 6: Frontend

### Task 6.1: Notification bell and dropdown
**Files to create:**
- `frontend/src/components/notifications/notification-bell.tsx` - Bell icon in header with unread badge
- `frontend/src/components/notifications/notification-dropdown.tsx` - Dropdown with recent notifications
- `frontend/src/stores/notifications.ts` - Zustand store: notifications list, unread count, fetch, markRead
- `frontend/src/hooks/use-notifications.ts` - Hook with WebSocket integration for real-time badge updates

**Files to modify:**
- `frontend/src/components/layout/header.tsx` - Add NotificationBell component

### Task 6.2: Notification preferences page
**Files to create:**
- `frontend/src/app/(dashboard)/settings/notifications/page.tsx` - Preferences matrix: category x channel x frequency
- `frontend/src/components/notifications/preferences-matrix.tsx` - Interactive matrix component

**Files to modify:**
- `frontend/src/app/(dashboard)/settings/layout.tsx` - Add "Notifications" to sidebar

### Task 6.3: Notification history page
**Files to create:**
- `frontend/src/app/(dashboard)/notifications/page.tsx` - Full notification history with filters

### Task 6.4: Admin channel configuration
**Files to create:**
- `frontend/src/app/(dashboard)/settings/notification-channels/page.tsx` - Admin page: configure email, Teams, Slack, Telegram, webhook channels. Test button per channel.

**Files to modify:**
- `frontend/src/app/(dashboard)/settings/layout.tsx` - Add "Channels" to sidebar (admin only)

---

## Wiring and Integration

### Task 7.1: Wire everything in main.go and update config
**Files to modify:**
- `backend/cmd/server/main.go` - Initialize broker, producer, consumer, router. Start consumer goroutine.
- `backend/internal/config/config.go` - Add all notification-related env vars
- `docker-compose.yml` - Add Kafka + Zookeeper services (optional)

---

## Task Summary

| # | Task | Dependencies | Agent |
|---|---|---|---|
| 1.1 | MessageBroker interface + InMemoryBroker | - | backend |
| 1.2 | KafkaBroker implementation | 1.1 | backend |
| 1.3 | Broker factory + config | 1.1, 1.2 | backend |
| 2.1 | DB migrations (3 tables) | - | backend |
| 2.2 | Store + Preferences CRUD | 2.1 | backend |
| 3.1 | Email channel | - | backend |
| 3.2 | Teams + Slack channels | - | backend |
| 3.3 | Telegram + Webhook channels | - | backend |
| 4.1 | EventProducer | 1.x, 2.x | backend |
| 4.2 | Router + Consumer | 4.1, 3.x | backend |
| 4.3 | Digest aggregator | 4.2 | backend |
| 5.1 | REST API handlers | 4.x | backend |
| 6.1 | Bell + dropdown | 5.1 | frontend |
| 6.2 | Preferences page | 5.1 | frontend |
| 6.3 | History page | 5.1 | frontend |
| 6.4 | Admin channels page | 5.1 | frontend |
| 7.1 | Wire main.go + docker-compose | 5.1 | backend |

**Total: 17 tasks**
