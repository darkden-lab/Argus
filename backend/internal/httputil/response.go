package httputil

import (
	"encoding/json"
	"net/http"
)

// WriteJSON writes v as JSON with the given HTTP status code.
func WriteJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

// WriteError writes a JSON error response with the given status and message.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}
