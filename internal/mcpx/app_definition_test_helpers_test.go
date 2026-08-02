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

func mustMarshalTestRawJSON(t *testing.T, value any, field string) projectstate.RawJSON {
	return appsubsystemtest.MustMarshalTestRawJSON(t, value, field)
}

func mustMarshalStoredAppDefinition(
	t *testing.T,
	definition appdefinition.AppDefinition,
) projectstate.RawJSON {
	return appsubsystemtest.MustMarshalStoredAppDefinition(t, definition)
}

func mustDecodeStoredAppDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	return appsubsystemtest.MustDecodeStoredAppDefinition(t, raw)
}
