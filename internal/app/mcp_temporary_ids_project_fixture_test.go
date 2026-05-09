package app

import (
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
)

func saveAppScopedMCPProject(t *testing.T, cfg config.Config) {
	t.Helper()

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				TopLevelSectionIDs: []string{
					"chat-section",
					"peer-chat-section",
					"allowed-section",
					"allowed-callable-section",
					"blocked-section",
					"blocked-callable-section",
					"allowed-params-section",
					"blocked-params-section",
				},
				SectionVariantMap: map[string]string{
					"chat-section":             "chat-variant",
					"peer-chat-section":        "peer-chat-variant",
					"allowed-section":          "allowed-variant",
					"allowed-callable-section": "allowed-callable-variant",
					"blocked-section":          "blocked-variant",
					"blocked-callable-section": "blocked-callable-variant",
					"allowed-params-section":   "allowed-params-variant",
					"blocked-params-section":   "blocked-params-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{
						ID:              "edge-context",
						SourceSectionID: "allowed-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-peer",
						SourceSectionID: "chat-section",
						TargetSectionID: "peer-chat-section",
						Kind:            "chat_chat",
					},
					{
						ID:              "edge-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-section",
						Kind:            "chat_section",
					},
					{
						ID:              "edge-callable-context",
						SourceSectionID: "allowed-callable-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-callable-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-callable-section",
						Kind:            "chat_section",
					},
					{
						ID:              "edge-params-context",
						SourceSectionID: "allowed-params-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-params-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-params-section",
						Kind:            "chat_section",
					},
				},
				Sections: map[string]projectstate.Section{
					"chat-section": {
						ID:               "chat-section",
						Name:             "Chat",
						VariantIDs:       []string{"chat-variant"},
						DefaultVariantID: "chat-variant",
					},
					"peer-chat-section": {
						ID:               "peer-chat-section",
						Name:             "Peer Chat",
						VariantIDs:       []string{"peer-chat-variant"},
						DefaultVariantID: "peer-chat-variant",
					},
					"allowed-section": {
						ID:               "allowed-section",
						Name:             "Allowed",
						VariantIDs:       []string{"allowed-variant"},
						DefaultVariantID: "allowed-variant",
					},
					"allowed-callable-section": {
						ID:               "allowed-callable-section",
						Name:             "Allowed Callable",
						VariantIDs:       []string{"allowed-callable-variant"},
						DefaultVariantID: "allowed-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"blocked-section": {
						ID:               "blocked-section",
						Name:             "Blocked",
						VariantIDs:       []string{"blocked-variant"},
						DefaultVariantID: "blocked-variant",
					},
					"blocked-callable-section": {
						ID:               "blocked-callable-section",
						Name:             "Blocked Callable",
						VariantIDs:       []string{"blocked-callable-variant"},
						DefaultVariantID: "blocked-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"allowed-params-section": {
						ID:               "allowed-params-section",
						Name:             "Allowed Params",
						VariantIDs:       []string{"allowed-params-variant"},
						DefaultVariantID: "allowed-params-variant",
					},
					"blocked-params-section": {
						ID:               "blocked-params-section",
						Name:             "Blocked Params",
						VariantIDs:       []string{"blocked-params-variant"},
						DefaultVariantID: "blocked-params-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":             {ID: "chat-variant", ImplID: "chat-impl"},
					"peer-chat-variant":        {ID: "peer-chat-variant", ImplID: "peer-chat-impl"},
					"allowed-variant":          {ID: "allowed-variant", ImplID: "allowed-impl"},
					"allowed-callable-variant": {ID: "allowed-callable-variant", ImplID: "allowed-callable-impl"},
					"blocked-variant":          {ID: "blocked-variant", ImplID: "blocked-impl"},
					"blocked-callable-variant": {ID: "blocked-callable-variant", ImplID: "blocked-callable-impl"},
					"allowed-params-variant":   {ID: "allowed-params-variant", ImplID: "allowed-params-impl"},
					"blocked-params-variant":   {ID: "blocked-params-variant", ImplID: "blocked-params-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl": {
						ID:      "chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
					},
					"peer-chat-impl": {
						ID:      "peer-chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"}),
					},
					"allowed-impl": {
						ID:   "allowed-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSONValue(t, map[string]any{
							"id":           "allowed-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('allowed')\n",
							"children":     []any{},
						}),
					},
					"allowed-callable-impl": {
						ID:   "allowed-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRawJSONValue(t, map[string]any{
							"id":       "allowed-callable-impl",
							"type":     "Callable",
							"callable": "allowed-callable-1",
							"codeObjVariantMap": map[string]string{
								"allowed-callable-1":     "allowed-callable-variant-a",
								"allowed-callable-2":     "allowed-callable-variant-b",
								"allowed-param-existing": "allowed-param-existing-variant",
							},
						}),
					},
					"blocked-impl": {
						ID:   "blocked-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSONValue(t, map[string]any{
							"id":           "blocked-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('blocked')\n",
							"children":     []any{},
						}),
					},
					"blocked-callable-impl": {
						ID:   "blocked-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRawJSONValue(t, map[string]any{
							"id":                "blocked-callable-impl",
							"type":              "Callable",
							"callable":          nil,
							"codeObjVariantMap": map[string]string{},
						}),
					},
					"allowed-params-impl": {
						ID:      "allowed-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-params-impl", "type": "Dict", "topLevelParamId": "allowed-param", "codeObjVariantMap": map[string]string{"allowed-param": "allowed-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
					"blocked-params-impl": {
						ID:      "blocked-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "blocked-params-impl", "type": "Dict", "topLevelParamId": "blocked-param", "codeObjVariantMap": map[string]string{"blocked-param": "blocked-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"allowed-callable-1": {
						ID:               "allowed-callable-1",
						Name:             "existing_callable",
						VariantIDs:       []string{"allowed-callable-variant-a"},
						DefaultVariantID: "allowed-callable-variant-a",
					},
					"allowed-callable-2": {
						ID:               "allowed-callable-2",
						Name:             "sorted",
						VariantIDs:       []string{"allowed-callable-variant-b"},
						DefaultVariantID: "allowed-callable-variant-b",
					},
					"allowed-param-existing": {
						ID:               "allowed-param-existing",
						Name:             "iterable",
						VariantIDs:       []string{"allowed-param-existing-variant"},
						DefaultVariantID: "allowed-param-existing-variant",
					},
					"allowed-param": {
						ID:               "allowed-param",
						Name:             "allowed_param",
						VariantIDs:       []string{"allowed-param-variant"},
						DefaultVariantID: "allowed-param-variant",
					},
					"blocked-param": {
						ID:               "blocked-param",
						Name:             "blocked_param",
						VariantIDs:       []string{"blocked-param-variant"},
						DefaultVariantID: "blocked-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"allowed-callable-variant-a": {
						ID:     "allowed-callable-variant-a",
						ImplID: "allowed-callable-impl-a",
					},
					"allowed-callable-variant-b": {
						ID:     "allowed-callable-variant-b",
						ImplID: "allowed-callable-impl-b",
					},
					"allowed-param-existing-variant": {
						ID:     "allowed-param-existing-variant",
						ImplID: "allowed-param-existing-impl",
					},
					"allowed-param-variant": {
						ID:     "allowed-param-variant",
						ImplID: "allowed-param-impl",
					},
					"blocked-param-variant": {
						ID:     "blocked-param-variant",
						ImplID: "blocked-param-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"allowed-callable-impl-a": {
						ID:      "allowed-callable-impl-a",
						Type:    "CodeCallable",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-callable-impl-a", "type": "CodeCallable", "children": []any{}}),
					},
					"allowed-callable-impl-b": {
						ID:      "allowed-callable-impl-b",
						Type:    "CodeCallable",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-callable-impl-b", "type": "CodeCallable", "children": []any{"allowed-param-existing"}}),
					},
					"allowed-param-existing-impl": {
						ID:      "allowed-param-existing-impl",
						Type:    "CodeParam",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-param-existing-impl", "type": "CodeParam", "value": "user_value", "passingStyle": "DEFAULT"}),
					},
					"allowed-param-impl": {
						ID:      "allowed-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-param-impl", "type": "TextParam", "value": "1"}),
					},
					"blocked-param-impl": {
						ID:      "blocked-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSONValue(t, map[string]any{"id": "blocked-param-impl", "type": "TextParam", "value": "2"}),
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("save scoped MCP project: %v", err)
	}
}
