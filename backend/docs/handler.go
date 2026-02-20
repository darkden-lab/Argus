package docs

import (
	"embed"
	"net/http"

	"github.com/gorilla/mux"
)

//go:embed openapi.yaml
var openAPISpec embed.FS

// RegisterRoutes serves the OpenAPI spec and a Swagger UI redirect.
func RegisterRoutes(r *mux.Router) {
	// Serve the raw OpenAPI spec
	r.HandleFunc("/api/docs/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		data, err := openAPISpec.ReadFile("openapi.yaml")
		if err != nil {
			http.Error(w, "spec not found", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/yaml")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(data)
	}).Methods("GET")

	// Serve a simple Swagger UI page
	r.HandleFunc("/api/docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(swaggerUIHTML))
	}).Methods("GET")
}

const swaggerUIHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>K8s Dashboard API Docs</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>`
