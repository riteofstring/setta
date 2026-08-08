package appdefinition

import "errors"

var (
	ErrAppSpecPathUnconfigured = errors.New("app spec path is not configured for this project")
	ErrAppSpecNotFound         = errors.New("app spec not found for this project")
	ErrAppSpecPatchInvalid     = errors.New("app spec patch stream is invalid")
)
