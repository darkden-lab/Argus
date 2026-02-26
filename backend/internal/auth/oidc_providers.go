package auth

// OIDCProviderPreset defines a pre-configured OIDC provider template.
type OIDCProviderPreset struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	IssuerFormat string          `json:"issuer_format"`
	GroupsClaim  string          `json:"groups_claim"`
	ExtraScopes  []string        `json:"extra_scopes,omitempty"`
	ExtraFields  []ProviderField `json:"extra_fields,omitempty"`
}

// ProviderField describes an additional configuration field for a provider.
type ProviderField struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Placeholder string `json:"placeholder"`
	Required    bool   `json:"required"`
}

var providerPresets = []OIDCProviderPreset{
	{
		ID:           "entraid",
		Name:         "Microsoft Entra ID",
		Description:  "Azure Active Directory / Entra ID",
		IssuerFormat: "https://login.microsoftonline.com/{tenant_id}/v2.0",
		GroupsClaim:  "groups",
		ExtraScopes:  []string{"offline_access"},
		ExtraFields: []ProviderField{
			{Key: "tenant_id", Label: "Tenant ID", Placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", Required: true},
		},
	},
	{
		ID:           "google",
		Name:         "Google Workspace",
		Description:  "Google OAuth 2.0 / Workspace",
		IssuerFormat: "https://accounts.google.com",
		GroupsClaim:  "",
		ExtraScopes:  nil,
		ExtraFields:  nil,
	},
	{
		ID:           "okta",
		Name:         "Okta",
		Description:  "Okta Identity Provider",
		IssuerFormat: "https://{domain}.okta.com",
		GroupsClaim:  "groups",
		ExtraScopes:  []string{"groups"},
		ExtraFields: []ProviderField{
			{Key: "domain", Label: "Okta Domain", Placeholder: "your-org", Required: true},
		},
	},
	{
		ID:           "auth0",
		Name:         "Auth0",
		Description:  "Auth0 by Okta",
		IssuerFormat: "https://{domain}.auth0.com/",
		GroupsClaim:  "",
		ExtraScopes:  nil,
		ExtraFields: []ProviderField{
			{Key: "domain", Label: "Auth0 Domain", Placeholder: "your-tenant", Required: true},
		},
	},
	{
		ID:           "keycloak",
		Name:         "Keycloak",
		Description:  "Red Hat Keycloak / SSO",
		IssuerFormat: "https://{host}/realms/{realm}",
		GroupsClaim:  "groups",
		ExtraScopes:  nil,
		ExtraFields: []ProviderField{
			{Key: "host", Label: "Keycloak Host", Placeholder: "keycloak.example.com", Required: true},
			{Key: "realm", Label: "Realm", Placeholder: "master", Required: true},
		},
	},
	{
		ID:           "generic",
		Name:         "Generic OIDC",
		Description:  "Any OpenID Connect provider",
		IssuerFormat: "",
		GroupsClaim:  "",
		ExtraScopes:  nil,
		ExtraFields:  nil,
	},
}

// GetProviderPresets returns all available OIDC provider presets.
func GetProviderPresets() []OIDCProviderPreset {
	return providerPresets
}

// GetProviderPreset returns a specific preset by ID, or nil if not found.
func GetProviderPreset(id string) *OIDCProviderPreset {
	for _, p := range providerPresets {
		if p.ID == id {
			return &p
		}
	}
	return nil
}
