package tools

import (
	"testing"
)

func TestToolsForLevel(t *testing.T) {
	tests := []struct {
		name     string
		level    string
		wantNil  bool
		wantLen  int
		checkFn  func([]Tool) bool
	}{
		{
			name:    "disabled returns nil",
			level:   "disabled",
			wantNil: true,
		},
		{
			name:    "read_only returns ReadOnlyTools",
			level:   "read_only",
			wantNil: false,
			wantLen: len(ReadOnlyTools()),
			checkFn: func(tools []Tool) bool {
				// Should not contain any write tools
				writeNames := map[string]bool{
					"apply_yaml":          true,
					"delete_resource":     true,
					"scale_resource":      true,
					"restart_resource":    true,
					"rollback_deployment": true,
					"get_pod_exec":        true,
				}
				for _, tool := range tools {
					if writeNames[tool.Name] {
						return false
					}
				}
				return true
			},
		},
		{
			name:    "all returns AllTools including write tools",
			level:   "all",
			wantNil: false,
			wantLen: len(AllTools()),
			checkFn: func(tools []Tool) bool {
				// Should include at least one write tool
				for _, tool := range tools {
					if tool.Name == "apply_yaml" {
						return true
					}
				}
				return false
			},
		},
		{
			name:    "garbage level returns nil (deny-by-default)",
			level:   "garbage",
			wantNil: true,
		},
		{
			name:    "empty string returns nil (deny-by-default)",
			level:   "",
			wantNil: true,
		},
		{
			name:    "unknown level returns nil (deny-by-default)",
			level:   "admin",
			wantNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToolsForLevel(tt.level)
			if tt.wantNil {
				if got != nil {
					t.Errorf("ToolsForLevel(%q) = %v (len=%d), want nil", tt.level, got, len(got))
				}
				return
			}
			if got == nil {
				t.Fatalf("ToolsForLevel(%q) = nil, want non-nil slice", tt.level)
			}
			if len(got) != tt.wantLen {
				t.Errorf("ToolsForLevel(%q) returned %d tools, want %d", tt.level, len(got), tt.wantLen)
			}
			if tt.checkFn != nil && !tt.checkFn(got) {
				t.Errorf("ToolsForLevel(%q) failed content check", tt.level)
			}
		})
	}
}

func TestToolsForLevel_ReadOnlyNonEmpty(t *testing.T) {
	tools := ToolsForLevel("read_only")
	if len(tools) == 0 {
		t.Error("ToolsForLevel('read_only') returned empty slice, want non-empty")
	}
}

func TestToolsForLevel_AllIncludesReadAndWrite(t *testing.T) {
	all := ToolsForLevel("all")
	readOnly := ToolsForLevel("read_only")

	if len(all) <= len(readOnly) {
		t.Errorf("ToolsForLevel('all') has %d tools, expected more than read_only (%d)", len(all), len(readOnly))
	}
}
