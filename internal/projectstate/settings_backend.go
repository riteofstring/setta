package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

const DefaultAutoRefetchCallableParamsOnLSPMismatch = true

type RenameRefactorMode string

const (
	RenameRefactorModeAlwaysAsk    RenameRefactorMode = "ALWAYS_ASK"
	RenameRefactorModeAlwaysRename RenameRefactorMode = "ALWAYS_RENAME"
	RenameRefactorModeNeverRename  RenameRefactorMode = "NEVER_RENAME"
	DefaultRenameRefactorMode      RenameRefactorMode = RenameRefactorModeAlwaysAsk
)

var (
	ErrSettingsProjectAmbiguous = errors.New("settings project is ambiguous")
	ErrSettingsValueInvalid     = errors.New("settings value is invalid")
)

func AutoRefetchCallableParamsOnLSPMismatchEnabled(document Document) (bool, error) {
	rawValue, present, err := loadBackendSettingRawValue(document, "autoRefetchCallableParamsOnLSPMismatch")
	if err != nil {
		return false, err
	}
	if !present {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}
	return parseAutoRefetchCallableParamsOnLSPMismatch(rawValue)
}

func parseAutoRefetchCallableParamsOnLSPMismatch(rawValue string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(rawValue)) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, fmt.Errorf("%w: autoRefetchCallableParamsOnLSPMismatch=%q", ErrSettingsValueInvalid, rawValue)
	}
}

func RenameRefactorModeForDocument(document Document) (RenameRefactorMode, error) {
	rawValue, present, err := loadBackendSettingRawValue(document, "renameRefactorMode")
	if err != nil {
		return "", err
	}
	if !present {
		return DefaultRenameRefactorMode, nil
	}
	return parseRenameRefactorMode(rawValue)
}

func parseRenameRefactorMode(rawValue string) (RenameRefactorMode, error) {
	switch strings.ToUpper(strings.TrimSpace(rawValue)) {
	case string(RenameRefactorModeAlwaysAsk):
		return RenameRefactorModeAlwaysAsk, nil
	case string(RenameRefactorModeAlwaysRename):
		return RenameRefactorModeAlwaysRename, nil
	case string(RenameRefactorModeNeverRename):
		return RenameRefactorModeNeverRename, nil
	default:
		return "", fmt.Errorf("%w: renameRefactorMode=%q", ErrSettingsValueInvalid, rawValue)
	}
}

type backendSettingsRoot struct {
	project           Project
	codeObjVariantMap map[string]string
	topLevelPayload   map[string]any
}

func loadBackendSettingRawValue(document Document, settingName string) (string, bool, error) {
	root, ok, err := loadBackendSettingsRoot(document)
	if err != nil || !ok {
		return "", false, err
	}
	return root.rawSettingValue(settingName)
}

func loadBackendSettingsRoot(document Document) (backendSettingsRoot, bool, error) {
	settingsProject, ok, err := resolveSettingsProject(document)
	if err != nil || !ok {
		return backendSettingsRoot{}, ok, err
	}

	backendPayload, ok, err := resolveSettingsSectionPayload(settingsProject)
	if err != nil || !ok {
		return backendSettingsRoot{}, ok, err
	}

	codeObjVariantMap := payloadStringMapField(backendPayload, "codeObjVariantMap")
	topLevelParamID := payloadStringField(backendPayload, "topLevelParamId")
	if topLevelParamID == "" {
		return backendSettingsRoot{}, false, nil
	}

	topLevelPayload, _, _, _, err := effectiveCodeObjectPayload(settingsProject, codeObjVariantMap, topLevelParamID)
	if err != nil {
		return backendSettingsRoot{}, false, err
	}
	return backendSettingsRoot{
		project:           settingsProject,
		codeObjVariantMap: codeObjVariantMap,
		topLevelPayload:   topLevelPayload,
	}, true, nil
}

func resolveSettingsSectionPayload(settingsProject Project) (map[string]any, bool, error) {
	backendSectionID, ok, err := findSectionIDByName(settingsProject, "backend")
	if err != nil || !ok {
		return nil, ok, err
	}

	_, backendVariant, _, err := settingsProject.ResolveSection(backendSectionID)
	if err != nil {
		return nil, false, err
	}
	backendPayload, err := effectiveSectionPayload(settingsProject, backendSectionID, backendVariant.ID)
	if err != nil {
		return nil, false, err
	}
	return backendPayload, true, nil
}

func (root backendSettingsRoot) rawSettingValue(settingName string) (string, bool, error) {
	settingCodeObjID, ok, err := findChildCodeObjectIDByName(
		root.project,
		root.codeObjVariantMap,
		root.topLevelPayload,
		settingName,
	)
	if err != nil || !ok {
		return "", false, err
	}

	settingPayload, _, _, _, err := effectiveCodeObjectPayload(root.project, root.codeObjVariantMap, settingCodeObjID)
	if err != nil {
		return "", false, err
	}
	rawValue, present := payloadRawStringFieldWithPresence(settingPayload, "value")
	return rawValue, present, nil
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
