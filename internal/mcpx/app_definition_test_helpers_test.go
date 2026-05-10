package mcpx

import (
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/projectstate"
	"setta/internal/testutil/appsubsystemtest"
)

func setTestAppDefinition(
	t *testing.T,
	runtime *projectstate.Runtime,
	input appdefinition.SetInput,
) {
	appsubsystemtest.SetTestAppDefinition(t, runtime, input)
}

func mustDecodeStoredAppDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	return appsubsystemtest.MustDecodeStoredAppDefinition(t, raw)
}
