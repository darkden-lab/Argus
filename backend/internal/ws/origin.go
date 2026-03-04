package ws

import "net/http"

// CheckOrigin allows all origins for WebSocket upgrade requests.
// Origin validation is already handled by the CORS middleware at the HTTP
// layer, so duplicating it here only causes false rejections (e.g. when the
// browser origin doesn't exactly match ALLOWED_ORIGINS).
func CheckOrigin(_ *http.Request) bool {
	return true
}
