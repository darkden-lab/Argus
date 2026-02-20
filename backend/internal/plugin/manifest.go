package plugin

type Manifest struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Version     string           `json:"version"`
	Description string           `json:"description"`
	Permissions []string         `json:"permissions"`
	Backend     BackendManifest  `json:"backend"`
	Frontend    FrontendManifest `json:"frontend"`
}

type BackendManifest struct {
	Routes   []RouteDefinition   `json:"routes"`
	Watchers []WatcherDefinition `json:"watchers"`
}

type FrontendManifest struct {
	Navigation []NavItem       `json:"navigation"`
	Routes     []FrontendRoute `json:"routes"`
	Widgets    []Widget        `json:"widgets"`
}

type RouteDefinition struct {
	Method  string `json:"method"`
	Path    string `json:"path"`
	Handler string `json:"handler"`
}

type WatcherDefinition struct {
	Group    string `json:"group"`
	Version  string `json:"version"`
	Resource string `json:"resource"`
}

type NavItem struct {
	Label string `json:"label"`
	Icon  string `json:"icon"`
	Path  string `json:"path"`
}

type FrontendRoute struct {
	Path      string `json:"path"`
	Component string `json:"component"`
}

type Widget struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Component string `json:"component"`
}
