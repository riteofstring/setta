package httpapi

import "setta/internal/projectstate"

const (
	frontendSettaAPIPresetProjectConfigIDToken    = "__SETTA_RUNTIME_PROJECT_CONFIG_ID__"
	frontendSettaAPIPresetEmptySpacePositionToken = "__SETTA_RUNTIME_EMPTY_SPACE_POSITION__"
)

type FrontendSettaAPIPresetRuntimeValueTokens struct {
	ProjectConfigID    string `json:"projectConfigId"`
	EmptySpacePosition string `json:"emptySpacePosition"`
}

type FrontendSettaAPIPreset struct {
	Label        string         `json:"label"`
	Route        string         `json:"route"`
	BodyTemplate map[string]any `json:"bodyTemplate"`
}

type FrontendSettaAPIPresetConfigValue struct {
	RuntimeValueTokens FrontendSettaAPIPresetRuntimeValueTokens `json:"runtimeValueTokens"`
	Presets            []FrontendSettaAPIPreset                 `json:"presets"`
}

var frontendSettaAPIPresets = []FrontendSettaAPIPreset{
	{
		Label: "Create top-level section",
		Route: RouteCreateTopLevelSection,
		BodyTemplate: map[string]any{
			"projectConfigId":    frontendSettaAPIPresetProjectConfigIDToken,
			"implType":           projectstate.FrontendSectionTypeTextBlock,
			"controlCodeObjType": nil,
			"implOverrides": map[string]any{
				"type": projectstate.FrontendSectionTypeTextBlock,
				"text": "Hello",
			},
			"position": frontendSettaAPIPresetEmptySpacePositionToken,
		},
	},
	{
		Label: "Get latest project state",
		Route: RouteGetLatestProjectState,
		BodyTemplate: map[string]any{
			"projectConfigId": frontendSettaAPIPresetProjectConfigIDToken,
		},
	},
	{
		Label: "Save project",
		Route: RouteSaveProject,
		BodyTemplate: map[string]any{
			"projectConfigId": frontendSettaAPIPresetProjectConfigIDToken,
		},
	},
}

// Keep Setta API preset labels and request-body templates Go-owned so the
// frontend does not hand-maintain backend request shape examples. The
// frontend only resolves the runtime tokens that require local state.
func FrontendValueSettaAPIPresetConfig() FrontendSettaAPIPresetConfigValue {
	return FrontendSettaAPIPresetConfigValue{
		RuntimeValueTokens: FrontendSettaAPIPresetRuntimeValueTokens{
			ProjectConfigID:    frontendSettaAPIPresetProjectConfigIDToken,
			EmptySpacePosition: frontendSettaAPIPresetEmptySpacePositionToken,
		},
		Presets: cloneFrontendSettaAPIPresets(frontendSettaAPIPresets),
	}
}

func cloneFrontendSettaAPIPresets(input []FrontendSettaAPIPreset) []FrontendSettaAPIPreset {
	output := make([]FrontendSettaAPIPreset, 0, len(input))
	for _, preset := range input {
		output = append(output, FrontendSettaAPIPreset{
			Label:        preset.Label,
			Route:        preset.Route,
			BodyTemplate: cloneAnyMap(preset.BodyTemplate),
		})
	}
	return output
}

func cloneAnyMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = cloneAnyValue(value)
	}
	return output
}

func cloneAnyValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneAnyMap(typed)
	case []any:
		output := make([]any, len(typed))
		for idx, entry := range typed {
			output[idx] = cloneAnyValue(entry)
		}
		return output
	default:
		return typed
	}
}
