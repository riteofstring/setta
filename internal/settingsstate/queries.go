package settingsstate

import (
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

const DefaultAutoRefetchCallableParamsOnLSPMismatch = true

type RenameRefactorMode = projectstate.RenameRefactorMode

const (
	RenameRefactorModeAlwaysAsk    = projectstate.RenameRefactorModeAlwaysAsk
	RenameRefactorModeAlwaysRename = projectstate.RenameRefactorModeAlwaysRename
	RenameRefactorModeNeverRename  = projectstate.RenameRefactorModeNeverRename
	DefaultRenameRefactorMode      = projectstate.DefaultRenameRefactorMode
)

func AutoRefetchCallableParamsOnLSPMismatchEnabled(document Document) (bool, error) {
	if document == nil {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}

	value, ok, err := boolField(backend, "autoRefetchCallableParamsOnLSPMismatch")
	if err != nil {
		return false, err
	}
	if !ok {
		return DefaultAutoRefetchCallableParamsOnLSPMismatch, nil
	}
	return value, nil
}

func RenameRefactorModeForDocument(document Document) (projectstate.RenameRefactorMode, error) {
	if document == nil {
		return projectstate.DefaultRenameRefactorMode, nil
	}

	backend, ok, err := objectField(document, "backend")
	if err != nil {
		return "", err
	}
	if !ok {
		return projectstate.DefaultRenameRefactorMode, nil
	}

	value, ok, err := stringField(backend, "renameRefactorMode")
	if err != nil {
		return "", err
	}
	if !ok {
		return projectstate.DefaultRenameRefactorMode, nil
	}

	switch strings.ToUpper(strings.TrimSpace(value)) {
	case string(projectstate.RenameRefactorModeAlwaysAsk):
		return projectstate.RenameRefactorModeAlwaysAsk, nil
	case string(projectstate.RenameRefactorModeAlwaysRename):
		return projectstate.RenameRefactorModeAlwaysRename, nil
	case string(projectstate.RenameRefactorModeNeverRename):
		return projectstate.RenameRefactorModeNeverRename, nil
	default:
		return "", fmt.Errorf("%w: renameRefactorMode=%q", ErrSettingsValueInvalid, value)
	}
}
