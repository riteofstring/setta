package projectstate

import (
	"errors"
)

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
