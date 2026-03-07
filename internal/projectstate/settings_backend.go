package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

const DefaultAutoRefetchCallableParamsOnLSPMismatch = true

var (
	ErrSettingsProjectAmbiguous = errors.New("settings project is ambiguous")
	ErrSettingsValueInvalid     = errors.New("settings value is invalid")
)

func AutoRefetchCallableParamsOnLSPMismatchEnabled(document Document) (bool, error) {
	settingsProject, ok, err := resolveSettingsProject(document)
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	backendSectionID, ok, err := findSectionIDByName(settingsProject, "backend")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	_, backendVariant, _, err := settingsProject.ResolveSection(backendSectionID)
	if err != nil {
		return false, err
	}
	backendPayload, err := effectiveSectionPayload(settingsProject, backendSectionID, backendVariant.ID)
	if err != nil {
		return false, err
	}
	codeObjVariantMap := payloadStringMapField(backendPayload, "codeObjVariantMap")
	backendTopLevelParamID := payloadStringField(backendPayload, "topLevelParamId")
	if backendTopLevelParamID == "" {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	backendParamPayload, _, _, _, err := effectiveCodeObjectPayload(settingsProject, codeObjVariantMap, backendTopLevelParamID)
	if err != nil {
		return false, err
	}
	settingCodeObjID, ok, err := findChildCodeObjectIDByName(
		settingsProject,
		codeObjVariantMap,
		backendParamPayload,
		"autoRefetchCallableParamsOnLSPMismatch",
	)
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	settingPayload, _, _, _, err := effectiveCodeObjectPayload(settingsProject, codeObjVariantMap, settingCodeObjID)
	if err != nil {
		return false, err
	}
	rawValue, present := payloadRawStringFieldWithPresence(settingPayload, "value")
	if !present {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	switch strings.ToLower(strings.TrimSpace(rawValue)) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, fmt.Errorf("%w: autoRefetchCallableParamsOnLSPMismatch=%q", ErrSettingsValueInvalid, rawValue)
	}
}

func resolveSettingsProject(document Document) (Project, bool, error) {
	if len(document.Projects) == 0 {
		return Project{}, false, nil
	}
	if strings.TrimSpace(document.DefaultProjectID) != "" {
		project, err := document.ProjectByID(document.DefaultProjectID)
		return project, true, err
	}
	if len(document.Projects) == 1 {
		for _, project := range document.Projects {
			return project, true, nil
		}
	}
	return Project{}, false, ErrSettingsProjectAmbiguous
}

func findSectionIDByName(project Project, sectionName string) (string, bool, error) {
	targetName := strings.TrimSpace(sectionName)
	if targetName == "" {
		return "", false, nil
	}

	matchID := ""
	for sectionID, section := range project.Sections {
		if strings.TrimSpace(section.Name) != targetName {
			continue
		}
		if matchID != "" {
			return "", false, fmt.Errorf("%w: section %q", ErrSettingsProjectAmbiguous, targetName)
		}
		matchID = sectionID
	}
	if matchID == "" {
		return "", false, nil
	}
	return matchID, true, nil
}

func findChildCodeObjectIDByName(
	project Project,
	codeObjVariantMap map[string]string,
	parentPayload map[string]any,
	codeObjName string,
) (string, bool, error) {
	targetName := strings.TrimSpace(codeObjName)
	if targetName == "" {
		return "", false, nil
	}

	matchID := ""
	for _, childID := range payloadStringArrayField(parentPayload, "children") {
		_, codeObj, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, childID)
		if err != nil {
			return "", false, err
		}
		if strings.TrimSpace(codeObj.Name) != targetName {
			continue
		}
		if matchID != "" {
			return "", false, fmt.Errorf("%w: code object %q", ErrSettingsProjectAmbiguous, targetName)
		}
		matchID = codeObj.ID
	}
	if matchID == "" {
		return "", false, nil
	}
	return matchID, true, nil
}
