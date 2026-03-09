package tools

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditLogger logs AI tool executions to the database for observability.
type AuditLogger struct {
	pool *pgxpool.Pool
}

// NewAuditLogger creates a new AuditLogger.
func NewAuditLogger(pool *pgxpool.Pool) *AuditLogger {
	if pool == nil {
		return nil
	}
	return &AuditLogger{pool: pool}
}

// Log records a tool execution in the ai_tool_audit table.
func (a *AuditLogger) Log(ctx context.Context, userID, toolName, arguments, result string, isError bool, durationMs int64) {
	if a == nil || a.pool == nil {
		return
	}
	// Fire and forget — don't block the tool execution pipeline
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := a.pool.Exec(ctx,
			`INSERT INTO ai_tool_audit (user_id, tool_name, arguments, result, is_error, duration_ms)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			userID, toolName, truncateForAudit(arguments, 4096), truncateForAudit(result, 4096), isError, durationMs,
		)
		if err != nil {
			log.Printf("ai audit: failed to log tool execution: %v", err)
		}
	}()
}

func truncateForAudit(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}
