package settajsonrenderappgenbackend

import (
	"context"
	"testing"

	"setta/internal/projectstate"
)

func appDefinitionServiceForTest(
	runtime *projectstate.Runtime,
) projectstate.AppDefinitionRuntime {
	return NewAppDefinitionService(runtime)
}

func setTestAppDefinition(
	t *testing.T,
	runtime *projectstate.Runtime,
	input projectstate.SetAppDefinitionInput,
) {
	t.Helper()

	service := appDefinitionServiceForTest(runtime)
	if _, _, err := service.SetAppDefinition(context.Background(), input); err != nil {
		t.Fatalf("set app definition: %v", err)
	}
}
