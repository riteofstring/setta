package projectstate

import "errors"

var ErrAppSpecPatchInvalid = errors.New("app spec patch stream is invalid")

type StreamAppDefinitionInput struct {
	Patches     string
	AppSpecPath *string
	BaseAppSpec *map[string]any
}
