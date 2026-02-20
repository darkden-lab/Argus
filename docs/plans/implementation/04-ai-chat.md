# Implementation Plan: AI Chat Assistant

**Feature:** Chat de IA integrado con RAG y tool-use
**Design doc:** ../2026-02-20-features-expansion-design.md#feature-4
**Date:** 2026-02-20
**Status:** Pendiente
**Priority:** 4

---

## Phase 1: LLM Provider Interface

### Task 1.1: LLM provider interface and types
**Files to create:**
- `backend/internal/ai/types.go` - Core types: Message, Tool, ToolParam, Response, ToolCall, LLMProvider interface
- `backend/internal/ai/config.go` - AI config loading, provider selection

### Task 1.2: Claude provider
**Files to create:**
- `backend/internal/ai/providers/claude.go` - Anthropic API: Chat (with tools + streaming), Embed (voyage-3 or similar)
- `backend/internal/ai/providers/claude_test.go`

**Go dependency:** `github.com/anthropics/anthropic-sdk-go`

### Task 1.3: OpenAI provider
**Files to create:**
- `backend/internal/ai/providers/openai.go` - OpenAI API: Chat (with tools + streaming), Embed (text-embedding-3-small)
- `backend/internal/ai/providers/openai_test.go`

**Go dependency:** `github.com/sashabaranov/go-openai`

### Task 1.4: Ollama provider
**Files to create:**
- `backend/internal/ai/providers/ollama.go` - Ollama HTTP API: Chat, Embed (local models)
- `backend/internal/ai/providers/ollama_test.go`

---

## Phase 2: RAG Engine (pgvector)

### Task 2.1: pgvector setup and embeddings table
**Files to create:**
- `backend/migrations/004_ai_tables.up.sql`:
  - CREATE EXTENSION vector
  - ai_config table
  - ai_conversations table
  - ai_messages table
  - ai_embeddings table with vector column + ivfflat index
- `backend/migrations/004_ai_tables.down.sql`

### Task 2.2: RAG store and retriever
**Files to create:**
- `backend/internal/ai/rag/store.go` - pgvector store: InsertEmbedding, Search (cosine similarity, top-K)
- `backend/internal/ai/rag/retriever.go` - Retriever: takes query, embeds it, searches store, returns relevant chunks
- `backend/internal/ai/rag/store_test.go`

**Go dependency:** `github.com/pgvector/pgvector-go`

### Task 2.3: RAG indexer
**Files to create:**
- `backend/internal/ai/rag/indexer.go` - Indexes content sources:
  - K8s docs (embedded markdown files or fetched)
  - Plugin manifests and descriptions
  - CRDs from connected clusters (descriptions, schemas, examples)
  - Periodic re-indexing goroutine
- `backend/internal/ai/rag/sources.go` - Content source definitions and chunking strategy

**Dependencies:** Tasks 2.1, 2.2, Phase 1 (needs Embed from provider)

---

## Phase 3: Tool-use System

### Task 3.1: Tool definitions and executor
**Files to create:**
- `backend/internal/ai/tools/definitions.go` - All K8s tools defined:
  - Read-only: get_resources, describe_resource, get_events, get_logs, get_metrics, search_resources
  - Write (RequiresConfirm): apply_yaml, delete_resource, scale_resource, restart_resource
- `backend/internal/ai/tools/executor.go` - ToolExecutor: receives ToolCall, executes via ClusterManager, respects RBAC
- `backend/internal/ai/tools/executor_test.go`

**Dependencies:** Needs access to ClusterManager and RBAC engine

### Task 3.2: Confirmation flow
**Files to create:**
- `backend/internal/ai/tools/confirm.go` - ConfirmationManager:
  - Tools with RequiresConfirm send a "confirm_action" message to frontend
  - Waits for user approval/rejection via WebSocket
  - Timeout after 60s (auto-reject)
  - Logs confirmed actions to audit_log

**Dependencies:** Task 3.1

---

## Phase 4: AI Service (Orchestrator)

### Task 4.1: AI service core
**Files to create:**
- `backend/internal/ai/service.go` - AI service orchestrator:
  1. Receive user message
  2. Load conversation history from DB
  3. Add page context (cluster, namespace, resource being viewed)
  4. Search RAG for relevant context
  5. Build prompt: system message + RAG context + history + user message
  6. Call LLMProvider with tools
  7. Handle response: text → stream to frontend, tool_call → execute (or confirm) → re-invoke
  8. Save messages to DB
- `backend/internal/ai/service_test.go`

**Dependencies:** Phases 1, 2, 3

### Task 4.2: Chat WebSocket handler
**Files to create:**
- `backend/internal/ai/handlers.go` - WebSocket handler for chat:
  - Authenticate user
  - Handle message types: user_message, confirm_action, new_conversation, load_history
  - Stream responses token by token
  - Handle context updates (user navigates to different page)
- `backend/internal/ai/history.go` - Conversation history CRUD

**Files to modify:**
- `backend/cmd/server/main.go` - Wire AI WebSocket handler and config routes

**Dependencies:** Task 4.1

### Task 4.3: AI admin API
**Files to create:**
- `backend/internal/ai/admin_handlers.go` - REST endpoints:
  - GET /api/ai/config - Current AI config
  - PUT /api/ai/config - Update provider, model, API key, settings
  - POST /api/ai/config/test - Test connection to LLM provider
  - GET /api/ai/rag/status - RAG indexing status
  - POST /api/ai/rag/reindex - Trigger manual reindex

**Dependencies:** Task 4.2

---

## Phase 5: Frontend

### Task 5.1: Chat panel component
**Files to create:**
- `frontend/src/components/ai/chat-panel.tsx` - Drawer lateral derecho:
  - Message list with streaming text
  - Code blocks with syntax highlight and "Apply" button
  - Confirmation dialogs inline
  - Input bar with send button
  - Conversation sidebar (list previous chats)
- `frontend/src/components/ai/chat-message.tsx` - Individual message component (user/assistant/tool)
- `frontend/src/components/ai/chat-code-block.tsx` - Code block with copy and apply actions
- `frontend/src/components/ai/confirm-action.tsx` - Inline confirmation dialog for destructive actions
- `frontend/src/stores/ai-chat.ts` - Zustand store: conversations, messages, streaming state, active conversation
- `frontend/src/hooks/use-ai-chat.ts` - WebSocket hook for chat streaming

**Files to modify:**
- `frontend/src/app/(dashboard)/layout.tsx` - Add ChatPanel and floating button

### Task 5.2: AI settings page
**Files to create:**
- `frontend/src/app/(dashboard)/settings/ai/page.tsx` - Admin config:
  - Provider selector (Claude/OpenAI/Ollama)
  - API key input (masked)
  - Model selector
  - Base URL (for Ollama)
  - Toggle: enable/disable tools
  - Test connection button
  - RAG status and reindex button

**Files to modify:**
- `frontend/src/app/(dashboard)/settings/layout.tsx` - Add "AI Assistant" to sidebar

### Task 5.3: Context integration
**Files to modify:**
- `frontend/src/components/ai/chat-panel.tsx` - Send current page context (cluster, namespace, resource) when user sends message
- `frontend/src/app/(dashboard)/clusters/[id]/page.tsx` - "Ask AI about this cluster" button
- `frontend/src/components/resources/resource-detail.tsx` - "Ask AI about this resource" button

**Dependencies:** Task 5.1

---

## Task Summary

| # | Task | Dependencies | Agent |
|---|---|---|---|
| 1.1 | LLM provider interface | - | backend |
| 1.2 | Claude provider | 1.1 | backend |
| 1.3 | OpenAI provider | 1.1 | backend |
| 1.4 | Ollama provider | 1.1 | backend |
| 2.1 | pgvector migration | - | backend |
| 2.2 | RAG store + retriever | 2.1 | backend |
| 2.3 | RAG indexer | 2.2, 1.x | backend |
| 3.1 | Tool definitions + executor | - | backend |
| 3.2 | Confirmation flow | 3.1 | backend |
| 4.1 | AI service orchestrator | 1.x, 2.x, 3.x | backend |
| 4.2 | Chat WebSocket handler | 4.1 | backend |
| 4.3 | AI admin API | 4.2 | backend |
| 5.1 | Chat panel component | 4.2 | frontend |
| 5.2 | AI settings page | 4.3 | frontend |
| 5.3 | Context integration | 5.1 | frontend |

**Total: 15 tasks**
