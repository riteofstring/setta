package uisettings

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed section_ui_editor_tab_compatibility.json
var sectionUIEditorTabCompatibilityJSON []byte

var requiredUIEditorTabsBySectionType = mustLoadRequiredUIEditorTabsBySectionType()

func mustLoadRequiredUIEditorTabsBySectionType() map[string]map[string]struct{} {
	var rawPayload map[string][]string
	if err := json.Unmarshal(sectionUIEditorTabCompatibilityJSON, &rawPayload); err != nil {
		panic(fmt.Sprintf("uisettings: decode section UI editor tab compatibility: %v", err))
	}

	compatibility := make(map[string]map[string]struct{}, len(rawPayload))
	for rawSectionType, rawTabNames := range rawPayload {
		sectionType := strings.TrimSpace(rawSectionType)
		if sectionType == "" {
			panic("uisettings: section UI editor tab compatibility contains an empty section type key")
		}

		tabNames := make(map[string]struct{}, len(rawTabNames))
		for _, rawTabName := range rawTabNames {
			tabName := strings.TrimSpace(rawTabName)
			if tabName == "" {
				panic(fmt.Sprintf("uisettings: section UI editor tab compatibility contains an empty tab name for %s", sectionType))
			}
			tabNames[tabName] = struct{}{}
		}
		compatibility[sectionType] = tabNames
	}
	return compatibility
}
