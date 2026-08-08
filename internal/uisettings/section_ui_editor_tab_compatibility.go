package uisettings

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

//go:embed section_ui_editor_tab_compatibility.json
var sectionUIEditorTabCompatibilityJSON []byte

var (
	requiredUIEditorTabsBySectionTypeOrdered = mustLoadRequiredUIEditorTabsBySectionTypeOrdered()
	requiredUIEditorTabsBySectionType        = buildRequiredUIEditorTabsBySectionTypeLookup(requiredUIEditorTabsBySectionTypeOrdered)
)

func mustLoadRequiredUIEditorTabsBySectionTypeOrdered() map[string][]string {
	var rawPayload map[string][]string
	if err := json.Unmarshal(sectionUIEditorTabCompatibilityJSON, &rawPayload); err != nil {
		panic(fmt.Sprintf("uisettings: decode section UI editor tab compatibility: %v", err))
	}

	compatibility := make(map[string][]string, len(rawPayload))
	for rawSectionType, rawTabNames := range rawPayload {
		sectionType := strings.TrimSpace(rawSectionType)
		if sectionType == "" {
			panic("uisettings: section UI editor tab compatibility contains an empty section type key")
		}

		tabNames := make([]string, 0, len(rawTabNames))
		for _, rawTabName := range rawTabNames {
			tabName := strings.TrimSpace(rawTabName)
			if tabName == "" {
				panic(fmt.Sprintf("uisettings: section UI editor tab compatibility contains an empty tab name for %s", sectionType))
			}
			if !isValidUIEditorTabName(tabName) {
				panic(fmt.Sprintf("uisettings: section UI editor tab compatibility contains unknown tab name %q for %s", tabName, sectionType))
			}
			tabNames = append(tabNames, tabName)
		}
		compatibility[sectionType] = tabNames
	}
	return compatibility
}

func buildRequiredUIEditorTabsBySectionTypeLookup(ordered map[string][]string) map[string]map[string]struct{} {
	compatibility := make(map[string]map[string]struct{}, len(ordered))
	for sectionType, orderedTabNames := range ordered {
		tabNames := make(map[string]struct{}, len(orderedTabNames))
		for _, tabName := range orderedTabNames {
			tabNames[tabName] = struct{}{}
		}
		compatibility[sectionType] = tabNames
	}
	return compatibility
}

func RequiredUIEditorTabsBySectionType() map[string][]string {
	compatibility := make(map[string][]string, len(requiredUIEditorTabsBySectionTypeOrdered))
	for sectionType, orderedTabNames := range requiredUIEditorTabsBySectionTypeOrdered {
		compatibility[sectionType] = append([]string{}, orderedTabNames...)
	}
	return compatibility
}

type FrontendRequiredUIEditorTabMap map[projectstate.FrontendSectionType][]string

func FrontendValueRequiredUIEditorTabs() FrontendRequiredUIEditorTabMap {
	ordered := RequiredUIEditorTabsBySectionType()
	compatibility := make(FrontendRequiredUIEditorTabMap, len(ordered))
	for sectionType, tabNames := range ordered {
		compatibility[projectstate.FrontendSectionType(sectionType)] = append([]string{}, tabNames...)
	}
	return compatibility
}
