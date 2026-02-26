package setup

import (
	"encoding/json"
	"log"
	"net/http"
	"net/mail"
	"strings"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/httputil"
)

// Handlers provides HTTP handlers for the first-run setup wizard.
type Handlers struct {
	service     *Service
	authService *auth.AuthService
	jwtService  *auth.JWTService
	pool        *pgxpool.Pool
}

// NewHandlers creates a new Handlers.
func NewHandlers(service *Service, authService *auth.AuthService, jwtService *auth.JWTService, pool *pgxpool.Pool) *Handlers {
	return &Handlers{
		service:     service,
		authService: authService,
		jwtService:  jwtService,
		pool:        pool,
	}
}

// RegisterRoutes registers public setup routes (no auth required).
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/setup/status", h.handleStatus).Methods("GET")
	r.HandleFunc("/api/setup/init", h.handleInit).Methods("POST")
}

// statusResponse is the payload for GET /api/setup/status.
type statusResponse struct {
	SetupRequired bool `json:"setup_required"`
}

// initRequest is the expected payload for POST /api/setup/init.
type initRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// initResponse is the payload returned on successful init.
type initResponse struct {
	User         *auth.User `json:"user"`
	AccessToken  string     `json:"access_token"`
	RefreshToken string     `json:"refresh_token"`
}

func (h *Handlers) handleStatus(w http.ResponseWriter, r *http.Request) {
	required, err := h.service.IsSetupRequired(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to check setup status")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, statusResponse{SetupRequired: required})
}

func (h *Handlers) handleInit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Parse and validate request body BEFORE acquiring lock (cheap check first).
	var req initRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if problems := validateInitRequest(req); len(problems) > 0 {
		httputil.WriteJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
			"error":   "validation_failed",
			"message": "Request validation failed",
			"details": problems,
		})
		return
	}

	// 2. Begin transaction with advisory lock to serialize concurrent setup attempts.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Acquire advisory lock — prevents two concurrent POST /api/setup/init from racing.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(1)`); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to acquire setup lock")
		return
	}

	// 2a. Re-check setup required INSIDE the locked transaction (prevents TOCTOU).
	var alreadyDone bool
	err = tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM settings WHERE key = $1 AND value::text = '"true"')`,
		"system_setup_completed",
	).Scan(&alreadyDone)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to check setup status")
		return
	}
	if alreadyDone {
		httputil.WriteJSON(w, http.StatusForbidden, map[string]string{
			"error":   "setup_already_completed",
			"message": "Initial setup has already been completed",
		})
		return
	}

	// 3. Create user via authService (uses its own pool connection, but the
	// advisory lock prevents concurrent setup attempts).
	user, err := h.authService.Register(ctx, req.Email, req.Password, req.DisplayName)
	if err != nil {
		log.Printf("setup: failed to create admin user: %v", err)
		httputil.WriteJSON(w, http.StatusConflict, map[string]string{
			"error":   "user_creation_failed",
			"message": "Failed to create admin account. The email may already be registered.",
		})
		return
	}

	// 3b. Assign admin role.
	_, err = tx.Exec(ctx,
		`INSERT INTO user_roles (user_id, role_id)
		 SELECT $1, id FROM roles WHERE name = 'admin'`,
		user.ID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to assign admin role")
		return
	}

	// 3c. Mark setup as complete (inside tx so it's atomic with role assignment).
	_, err = tx.Exec(ctx,
		`INSERT INTO settings (key, value, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (key) DO UPDATE
		   SET value = EXCLUDED.value,
		       updated_at = NOW()`,
		"system_setup_completed", "true",
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to mark setup complete")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to commit setup")
		return
	}

	// 4. Generate JWT tokens.
	accessToken, err := h.jwtService.GenerateToken(user.ID, user.Email)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to generate access token")
		return
	}

	refreshToken, err := h.jwtService.GenerateRefreshToken(user.ID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to generate refresh token")
		return
	}

	// 5. Return response.
	httputil.WriteJSON(w, http.StatusCreated, initResponse{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
}

// fieldError describes a single validation problem.
type fieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// validateInitRequest checks all fields and returns any validation problems.
func validateInitRequest(req initRequest) []fieldError {
	var problems []fieldError

	email := strings.TrimSpace(req.Email)
	if email == "" {
		problems = append(problems, fieldError{Field: "email", Message: "email is required"})
	} else if _, err := mail.ParseAddress(email); err != nil {
		problems = append(problems, fieldError{Field: "email", Message: "invalid email format"})
	}

	if req.Password == "" {
		problems = append(problems, fieldError{Field: "password", Message: "password is required"})
	} else if len(req.Password) < 8 {
		problems = append(problems, fieldError{Field: "password", Message: "password must be at least 8 characters"})
	}

	if strings.TrimSpace(req.DisplayName) == "" {
		problems = append(problems, fieldError{Field: "display_name", Message: "display_name is required"})
	}

	return problems
}
