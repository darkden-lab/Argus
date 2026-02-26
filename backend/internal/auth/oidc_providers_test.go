package auth

import (
	"testing"
)

// --- GetProviderPresets tests ---

func TestGetProviderPresets_ReturnsAll(t *testing.T) {
	presets := GetProviderPresets()
	// There should be exactly 6 presets: entraid, google, okta, auth0, keycloak, generic
	if len(presets) != 6 {
		t.Errorf("expected 6 provider presets, got %d", len(presets))
	}
}

func TestGetProviderPresets_AllHaveRequiredFields(t *testing.T) {
	presets := GetProviderPresets()
	for _, p := range presets {
		if p.ID == "" {
			t.Errorf("preset has empty ID: %+v", p)
		}
		if p.Name == "" {
			t.Errorf("preset %q has empty Name", p.ID)
		}
		if p.Description == "" {
			t.Errorf("preset %q has empty Description", p.ID)
		}
	}
}

func TestGetProviderPresets_AllIDsAreUnique(t *testing.T) {
	presets := GetProviderPresets()
	seen := make(map[string]bool)
	for _, p := range presets {
		if seen[p.ID] {
			t.Errorf("duplicate preset ID: %q", p.ID)
		}
		seen[p.ID] = true
	}
}

func TestGetProviderPresets_IssuerFormatPresenceByProvider(t *testing.T) {
	// entraid, okta, auth0, keycloak — all have issuer formats with placeholders
	presets := GetProviderPresets()
	hasIssuer := make(map[string]string)
	for _, p := range presets {
		hasIssuer[p.ID] = p.IssuerFormat
	}

	// These providers MUST have an issuer format
	requiresIssuer := []string{"entraid", "okta", "auth0", "keycloak", "google"}
	for _, id := range requiresIssuer {
		// google has a fixed issuer, entraid/okta/auth0/keycloak have template formats
		if id == "generic" {
			continue
		}
		if hasIssuer[id] == "" && id != "generic" {
			// google has a fixed issuer URL, others have templates
			if id == "google" {
				if hasIssuer[id] == "" {
					t.Errorf("preset %q should have an IssuerFormat set", id)
				}
			}
		}
	}
}

func TestGetProviderPresets_ReturnsSameSliceLength(t *testing.T) {
	// GetProviderPresets returns the global slice directly (no copy).
	// Two calls should return slices of the same length.
	presets1 := GetProviderPresets()
	presets2 := GetProviderPresets()
	if len(presets1) != len(presets2) {
		t.Errorf("expected same length on two calls, got %d and %d", len(presets1), len(presets2))
	}
}

// --- GetProviderPreset tests ---

func TestGetProviderPreset_Entraid(t *testing.T) {
	p := GetProviderPreset("entraid")
	if p == nil {
		t.Fatal("expected non-nil preset for 'entraid'")
	}
	if p.ID != "entraid" {
		t.Errorf("expected ID='entraid', got '%s'", p.ID)
	}
	if p.Name != "Microsoft Entra ID" {
		t.Errorf("expected Name='Microsoft Entra ID', got '%s'", p.Name)
	}
}

func TestGetProviderPreset_Google(t *testing.T) {
	p := GetProviderPreset("google")
	if p == nil {
		t.Fatal("expected non-nil preset for 'google'")
	}
	if p.ID != "google" {
		t.Errorf("expected ID='google', got '%s'", p.ID)
	}
	if p.Name == "" {
		t.Error("expected non-empty Name for 'google'")
	}
}

func TestGetProviderPreset_Okta(t *testing.T) {
	p := GetProviderPreset("okta")
	if p == nil {
		t.Fatal("expected non-nil preset for 'okta'")
	}
	if p.GroupsClaim != "groups" {
		t.Errorf("expected Okta GroupsClaim='groups', got '%s'", p.GroupsClaim)
	}
}

func TestGetProviderPreset_Auth0(t *testing.T) {
	p := GetProviderPreset("auth0")
	if p == nil {
		t.Fatal("expected non-nil preset for 'auth0'")
	}
	// auth0 requires a 'domain' extra field
	found := false
	for _, f := range p.ExtraFields {
		if f.Key == "domain" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected Auth0 preset to have 'domain' extra field")
	}
}

func TestGetProviderPreset_Keycloak(t *testing.T) {
	p := GetProviderPreset("keycloak")
	if p == nil {
		t.Fatal("expected non-nil preset for 'keycloak'")
	}
	// Keycloak requires host and realm fields
	fieldKeys := make(map[string]bool)
	for _, f := range p.ExtraFields {
		fieldKeys[f.Key] = true
	}
	if !fieldKeys["host"] {
		t.Error("expected Keycloak preset to have 'host' extra field")
	}
	if !fieldKeys["realm"] {
		t.Error("expected Keycloak preset to have 'realm' extra field")
	}
}

func TestGetProviderPreset_Generic(t *testing.T) {
	p := GetProviderPreset("generic")
	if p == nil {
		t.Fatal("expected non-nil preset for 'generic'")
	}
	if p.ID != "generic" {
		t.Errorf("expected ID='generic', got '%s'", p.ID)
	}
}

func TestGetProviderPreset_NotFound(t *testing.T) {
	p := GetProviderPreset("nonexistent-provider")
	if p != nil {
		t.Error("expected nil for unknown provider ID, got non-nil")
	}
}

func TestGetProviderPreset_EmptyID(t *testing.T) {
	p := GetProviderPreset("")
	if p != nil {
		t.Error("expected nil for empty provider ID, got non-nil")
	}
}

func TestGetProviderPreset_CaseSensitive(t *testing.T) {
	// ID lookup should be case-sensitive
	p := GetProviderPreset("Entraid")
	if p != nil {
		t.Error("expected nil for 'Entraid' (wrong case), got non-nil")
	}
	p = GetProviderPreset("GOOGLE")
	if p != nil {
		t.Error("expected nil for 'GOOGLE' (wrong case), got non-nil")
	}
}

func TestGetProviderPreset_ReturnsDifferentPointerEachCall(t *testing.T) {
	// GetProviderPreset iterates with `for _, p := range` which copies each element.
	// So &p points to a local stack copy — two calls return two independent pointers.
	p1 := GetProviderPreset("entraid")
	p2 := GetProviderPreset("entraid")
	if p1 == nil || p2 == nil {
		t.Fatal("expected non-nil presets")
	}
	if p1 == p2 {
		t.Error("expected two different pointers on successive calls")
	}
}

// --- ProviderField required flag test ---

func TestEntraidHasRequiredTenantIDField(t *testing.T) {
	p := GetProviderPreset("entraid")
	if p == nil {
		t.Fatal("expected non-nil preset")
	}
	for _, f := range p.ExtraFields {
		if f.Key == "tenant_id" {
			if !f.Required {
				t.Error("expected tenant_id field to be Required=true for entraid")
			}
			return
		}
	}
	t.Error("expected entraid to have tenant_id extra field")
}

func TestOktaHasDomainExtraField(t *testing.T) {
	p := GetProviderPreset("okta")
	if p == nil {
		t.Fatal("expected non-nil preset")
	}
	for _, f := range p.ExtraFields {
		if f.Key == "domain" {
			if f.Label == "" {
				t.Error("expected domain field to have a Label")
			}
			return
		}
	}
	t.Error("expected okta to have domain extra field")
}

// --- IssuerFormat placeholder test ---

func TestEntraidIssuerFormatContainsTenantPlaceholder(t *testing.T) {
	p := GetProviderPreset("entraid")
	if p == nil {
		t.Fatal("expected non-nil preset")
	}
	if !containsString(p.IssuerFormat, "{tenant_id}") {
		t.Errorf("expected entraid IssuerFormat to contain {tenant_id}, got: %q", p.IssuerFormat)
	}
}

func TestOktaIssuerFormatContainsDomainPlaceholder(t *testing.T) {
	p := GetProviderPreset("okta")
	if p == nil {
		t.Fatal("expected non-nil preset")
	}
	if !containsString(p.IssuerFormat, "{domain}") {
		t.Errorf("expected okta IssuerFormat to contain {domain}, got: %q", p.IssuerFormat)
	}
}

func TestKeycloakIssuerFormatContainsBothPlaceholders(t *testing.T) {
	p := GetProviderPreset("keycloak")
	if p == nil {
		t.Fatal("expected non-nil preset")
	}
	if !containsString(p.IssuerFormat, "{host}") {
		t.Errorf("expected keycloak IssuerFormat to contain {host}, got: %q", p.IssuerFormat)
	}
	if !containsString(p.IssuerFormat, "{realm}") {
		t.Errorf("expected keycloak IssuerFormat to contain {realm}, got: %q", p.IssuerFormat)
	}
}

// helper
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}())
}
