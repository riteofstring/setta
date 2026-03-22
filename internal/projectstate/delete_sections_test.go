package projectstate

import (
	"reflect"
	"testing"
)

func TestProjectDeleteSectionsRemovesDescendantsAndTopLevelState(t *testing.T) {
	project := mustNormalizedDeleteProject(t, Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		EntryCodeBlockID: "parent-section",
		TopLevelSectionIDs: []string{
			"parent-section",
			"standalone-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"parent-section":     {X: 10, Y: 20},
			"standalone-section": {X: 30, Y: 40},
		},
		ActiveIDs: []string{
			"parent-section",
			"child-section",
			"standalone-section",
		},
		ViewModes: map[string]ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
				VisibilityBySectionID: map[string]bool{
					"parent-section":     true,
					"child-section":      true,
					"standalone-section": true,
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"parent-section":     {X: 10, Y: 20},
					"standalone-section": {X: 30, Y: 40},
				},
			},
		},
		Edges: []Edge{
			{
				ID:              "edge-1",
				SourceSectionID: "parent-section",
				SourceVariantID: "parent-variant",
				TargetSectionID: "standalone-section",
				TargetVariantID: "standalone-variant",
			},
		},
		AgenticEdges: []AgenticEdge{
			{
				ID:              "agentic-edge-1",
				SourceSectionID: "standalone-section",
				TargetSectionID: "child-section",
				Kind:            "section_chat",
			},
		},
		Sections: map[string]Section{
			"parent-section": {
				ID:               "parent-section",
				Name:             "Parent",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"child-section": {
				ID:               "child-section",
				Name:             "Child",
				VariantIDs:       []string{"child-variant"},
				DefaultVariantID: "child-variant",
				ParentSectionID:  "parent-section",
			},
			"standalone-section": {
				ID:               "standalone-section",
				Name:             "Standalone",
				VariantIDs:       []string{"standalone-variant"},
				DefaultVariantID: "standalone-variant",
			},
		},
		SectionVariantMap: map[string]string{
			"parent-section":     "parent-variant",
			"child-section":      "child-variant",
			"standalone-section": "standalone-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"parent-variant":     {ID: "parent-variant", ImplID: "parent-impl"},
			"child-variant":      {ID: "child-variant", ImplID: "child-impl"},
			"standalone-variant": {ID: "standalone-variant", ImplID: "standalone-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "parent-impl", "type": "Group", "children": []string{"child-section"}}),
			},
			"child-impl": {
				ID:      "child-impl",
				Kind:    SectionKind("text_block"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-impl", "type": "TextBlock"}),
			},
			"standalone-impl": {
				ID:      "standalone-impl",
				Kind:    SectionKind("chat"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "standalone-impl", "type": "Chat"}),
			},
		},
	})

	result, err := project.DeleteSections(DeleteSectionsInput{
		SectionIDs: []string{"parent-section"},
	})
	if err != nil {
		t.Fatalf("DeleteSections returned error: %v", err)
	}
	if !reflect.DeepEqual(result.SectionIDs, []string{"parent-section", "child-section"}) {
		t.Fatalf("expected recursive delete result, got %#v", result.SectionIDs)
	}

	if _, ok := project.Sections["parent-section"]; ok {
		t.Fatalf("expected parent-section to be removed, got %#v", project.Sections)
	}
	if _, ok := project.Sections["child-section"]; ok {
		t.Fatalf("expected child-section to be removed, got %#v", project.Sections)
	}
	if !reflect.DeepEqual(project.TopLevelSectionIDs, []string{"standalone-section"}) {
		t.Fatalf("expected standalone-section as only top-level id, got %#v", project.TopLevelSectionIDs)
	}
	if len(project.TopLevelSections) != 1 {
		t.Fatalf("expected one top-level layout, got %#v", project.TopLevelSections)
	}
	if _, ok := project.TopLevelSections["standalone-section"]; !ok {
		t.Fatalf("expected standalone-section top-level layout, got %#v", project.TopLevelSections)
	}
	if !reflect.DeepEqual(project.ActiveIDs, []string{"standalone-section"}) {
		t.Fatalf("expected only standalone-section active, got %#v", project.ActiveIDs)
	}
	if project.EntryCodeBlockID != "" {
		t.Fatalf("expected entry code block to clear, got %q", project.EntryCodeBlockID)
	}
	if len(project.Edges) != 0 {
		t.Fatalf("expected edges referencing deleted sections to be removed, got %#v", project.Edges)
	}
	if len(project.AgenticEdges) != 0 {
		t.Fatalf("expected agentic edges referencing deleted sections to be removed, got %#v", project.AgenticEdges)
	}

	viewMode := project.ViewModes["focus"]
	if _, ok := viewMode.VisibilityBySectionID["parent-section"]; ok {
		t.Fatalf("expected parent-section visibility to be removed, got %#v", viewMode.VisibilityBySectionID)
	}
	if _, ok := viewMode.VisibilityBySectionID["child-section"]; ok {
		t.Fatalf("expected child-section visibility to be removed, got %#v", viewMode.VisibilityBySectionID)
	}
	if _, ok := viewMode.TopLevelSections["parent-section"]; ok {
		t.Fatalf("expected parent-section top-level layout to be removed from view mode, got %#v", viewMode.TopLevelSections)
	}
}

func TestProjectDeleteSectionsCleansSectionVariantMap(t *testing.T) {
	project := mustNormalizedDeleteProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"chat-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"chat-section": {X: 10, Y: 20},
		},
		Sections: map[string]Section{
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
		},
		SectionVariantMap: map[string]string{
			"chat-section": "chat-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"chat-variant": {ID: "chat-variant", ImplID: "chat-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"chat-impl": {
				ID:      "chat-impl",
				Kind:    SectionKind("chat"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "chat-impl", "type": "Chat"}),
			},
		},
	})

	if _, err := project.DeleteSections(DeleteSectionsInput{
		SectionIDs: []string{"chat-section"},
	}); err != nil {
		t.Fatalf("DeleteSections returned error: %v", err)
	}

	if _, ok := project.SectionVariantMap["chat-section"]; ok {
		t.Fatalf("expected deleted section variant map entry to be removed, got %#v", project.SectionVariantMap)
	}
	if len(project.SectionVariantMap) != 0 {
		t.Fatalf("expected empty section variant map after delete, got %#v", project.SectionVariantMap)
	}
}

func TestProjectDeleteSectionsPrunesProjectChatWindowingForRemovedSections(t *testing.T) {
	chatSectionID := "chat-section"
	project := mustNormalizedDeleteProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			chatSectionID,
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			chatSectionID: {X: 10, Y: 20},
		},
		Sections: map[string]Section{
			chatSectionID: {
				ID:               chatSectionID,
				Name:             "Chat",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
		},
		SectionVariantMap: map[string]string{
			chatSectionID: "chat-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"chat-variant": {ID: "chat-variant", ImplID: "chat-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"chat-impl": {
				ID:      "chat-impl",
				Kind:    SectionKind("chat"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "chat-impl", "type": "Chat"}),
			},
		},
		ProjectChatWindowing: &ProjectChatWindowingState{
			InstancesByID: map[string]ProjectChatWindowInstance{
				"project-chat-window-1": {
					InstanceID:      "project-chat-window-1",
					Placement:       ChatWindowPlacementFloating,
					Mode:            ChatWindowModeSection,
					SectionIDOrNull: stringPointer(chatSectionID),
				},
			},
			Order:              []string{"project-chat-window-1"},
			NextInstanceNumber: 2,
		},
	})

	if _, err := project.DeleteSections(DeleteSectionsInput{
		SectionIDs: []string{chatSectionID},
	}); err != nil {
		t.Fatalf("DeleteSections returned error: %v", err)
	}

	if project.ProjectChatWindowing == nil {
		t.Fatal("expected project chat windowing to remain initialized")
	}
	if len(project.ProjectChatWindowing.InstancesByID) != 0 {
		t.Fatalf("expected deleted section windows to be pruned, got %#v", project.ProjectChatWindowing.InstancesByID)
	}
	if !reflect.DeepEqual(project.ProjectChatWindowing.Order, []string{}) {
		t.Fatalf("expected empty project chat window order after delete, got %#v", project.ProjectChatWindowing.Order)
	}
	if project.ProjectChatWindowing.NextInstanceNumber != 2 {
		t.Fatalf("expected nextInstanceNumber to be preserved, got %d", project.ProjectChatWindowing.NextInstanceNumber)
	}
}

func TestProjectDeleteSectionsClearsAttachedTerminalReferences(t *testing.T) {
	project := mustNormalizedDeleteProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"code-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"code-section": {X: 10, Y: 20},
		},
		Sections: map[string]Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
				ParentSectionID:  "code-section",
			},
		},
		SectionVariantMap: map[string]string{
			"code-section":     "code-variant",
			"terminal-section": "terminal-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"code-variant":     {ID: "code-variant", ImplID: "code-impl"},
			"terminal-variant": {ID: "terminal-variant", ImplID: "terminal-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language:                  CodeLanguagePython,
					AttachedTerminalSectionID: "terminal-section",
					Children:                  []string{"terminal-section"},
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                        "code-impl",
					"type":                      "Code",
					"codeLanguage":              "python",
					"children":                  []string{"terminal-section"},
					"attachedTerminalSectionId": "terminal-section",
				}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     SectionKindTerminal,
				Terminal: &TerminalSectionImpl{},
				Payload:  mustMarshalProjectObject(map[string]any{"id": "terminal-impl", "type": "Terminal"}),
			},
		},
	})

	if _, err := project.DeleteSections(DeleteSectionsInput{
		SectionIDs: []string{"terminal-section"},
	}); err != nil {
		t.Fatalf("DeleteSections returned error: %v", err)
	}

	codeImpl := project.SectionImpls["code-impl"]
	if codeImpl.Code == nil {
		t.Fatalf("expected code impl to remain typed, got %#v", codeImpl)
	}
	if codeImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("expected attached terminal id to clear, got %q", codeImpl.Code.AttachedTerminalSectionID)
	}
	if len(codeImpl.Code.Children) != 0 {
		t.Fatalf("expected code children to clear, got %#v", codeImpl.Code.Children)
	}

	payload, err := effectiveSectionPayload(project, "code-section", "code-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload returned error: %v", err)
	}
	if attached := payloadStringField(payload, "attachedTerminalSectionId"); attached != "" {
		t.Fatalf("expected payload attachedTerminalSectionId to clear, got %q", attached)
	}
	if children := payloadStringArrayField(payload, "children"); len(children) != 0 {
		t.Fatalf("expected payload children to clear, got %#v", children)
	}
	if _, ok := project.Sections["terminal-section"]; ok {
		t.Fatalf("expected terminal-section to be removed, got %#v", project.Sections)
	}
}

func TestProjectDeleteSectionsPrunesUnusedCodeObjects(t *testing.T) {
	project := mustNormalizedDeleteProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"params-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"params-section": {X: 10, Y: 20},
		},
		Sections: map[string]Section{
			"params-section": {
				ID:               "params-section",
				Name:             "Params",
				VariantIDs:       []string{"params-variant"},
				DefaultVariantID: "params-variant",
			},
		},
		SectionVariantMap: map[string]string{
			"params-section": "params-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"params-variant": {ID: "params-variant", ImplID: "params-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"params-impl": {
				ID:      "params-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "params-impl", "type": "Dict", "codeObjVariantMap": map[string]string{"callable": "callable-variant"}}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"callable": {
				ID:               "callable",
				Name:             "callable",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"param-child": {
				ID:               "param-child",
				Name:             "param_child",
				VariantIDs:       []string{"param-child-variant"},
				DefaultVariantID: "param-child-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"callable-variant":    {ID: "callable-variant", ImplID: "callable-impl"},
			"param-child-variant": {ID: "param-child-variant", ImplID: "param-child-impl"},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Type:    "CodeCallable",
				Payload: mustMarshalProjectObject(map[string]any{"id": "callable-impl", "type": "CodeCallable", "children": []string{"param-child"}}),
			},
			"param-child-impl": {
				ID:      "param-child-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "param-child-impl", "type": "TextParam", "value": "seed"}),
			},
		},
	})

	if _, err := project.DeleteSections(DeleteSectionsInput{
		SectionIDs: []string{"params-section"},
	}); err != nil {
		t.Fatalf("DeleteSections returned error: %v", err)
	}

	if len(project.CodeObjs) != 0 {
		t.Fatalf("expected code objects to prune after section delete, got %#v", project.CodeObjs)
	}
	if len(project.CodeObjVariants) != 0 {
		t.Fatalf("expected code object variants to prune after section delete, got %#v", project.CodeObjVariants)
	}
	if len(project.CodeObjImpls) != 0 {
		t.Fatalf("expected code object impls to prune after section delete, got %#v", project.CodeObjImpls)
	}
}

func TestProjectDeleteSectionsClearsTargetValueWhenRemovingLastIncomingEdge(t *testing.T) {
	project := mustNormalizedDeleteProject(t, Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"source-section",
			"target-section",
		},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"source-section": {X: 10, Y: 20},
			"target-section": {X: 30, Y: 40},
		},
		Edges: []Edge{
			{
				ID:              "edge-1",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				TargetSectionID: "target-section",
				TargetVariantID: "target-variant",
				TargetPortID:    "target-param",
			},
		},
		Sections: map[string]Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"target-section": {
				ID:               "target-section",
				Name:             "Target",
				VariantIDs:       []string{"target-variant"},
				DefaultVariantID: "target-variant",
			},
		},
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
			"target-section": "target-variant",
		},
		SectionVariants: map[string]SectionVariant{
			"source-variant": {ID: "source-variant", ImplID: "source-impl"},
			"target-variant": {ID: "target-variant", ImplID: "target-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"source-impl": {
				ID:      "source-impl",
				Kind:    SectionKind("chat"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "source-impl", "type": "Chat"}),
			},
			"target-impl": {
				ID:      "target-impl",
				Kind:    SectionKind("dict"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-impl", "type": "Dict", "codeObjVariantMap": map[string]string{"target-param": "target-param-variant"}}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"target-param": {
				ID:               "target-param",
				Name:             "target_param",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"target-param-variant": {ID: "target-param-variant", ImplID: "target-param-impl"},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"target-param-impl": {
				ID:      "target-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "target-param-impl", "type": "TextParam", "value": "seed"}),
			},
		},
	})

	if _, err := project.DeleteSections(DeleteSectionsInput{
		SectionIDs: []string{"source-section"},
	}); err != nil {
		t.Fatalf("DeleteSections returned error: %v", err)
	}

	if len(project.Edges) != 0 {
		t.Fatalf("expected deleted-source edge to be removed, got %#v", project.Edges)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("target-section", "target-param")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject returned error: %v", err)
	}
	if got := payload["value"]; got != "" {
		t.Fatalf("expected cleared target value, got %#v", got)
	}
}

func mustNormalizedDeleteProject(t *testing.T, project Project) Project {
	t.Helper()

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project: %v", err)
	}
	return normalized
}
