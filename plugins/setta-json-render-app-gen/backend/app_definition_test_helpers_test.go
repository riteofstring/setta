package settajsonrenderappgenbackend

import (
	"context"
	"testing"

	"setta/internal/projectstate"
	appdefinitionpkg "setta/plugins/setta-json-render-app-gen/backend/appdefinition"
)

func appDefinitionServiceForTest(
	runtime *projectstate.Runtime,
) appdefinitionpkg.Runtime {
	return NewAppDefinitionService(runtime, ProviderPluginID)
}

func setTestAppDefinition(
	t *testing.T,
	runtime *projectstate.Runtime,
	input appdefinitionpkg.SetInput,
) {
	t.Helper()

	service := appDefinitionServiceForTest(runtime)
	if _, _, err := service.SetAppDefinition(context.Background(), input); err != nil {
		t.Fatalf("set app definition: %v", err)
	}
}

func mustEncodeStoredAppDefinition(
	t *testing.T,
	definition *appdefinitionpkg.AppDefinition,
) projectstate.RawJSON {
	t.Helper()

	raw, err := appdefinitionpkg.EncodeStoredAppDefinition(definition)
	if err != nil {
		t.Fatalf("encode stored app definition: %v", err)
	}
	return raw
}

func mustDecodeStoredAppDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) *appdefinitionpkg.AppDefinition {
	t.Helper()

	definition, err := appdefinitionpkg.DecodeStoredAppDefinition(raw)
	if err != nil {
		t.Fatalf("decode stored app definition: %v", err)
	}
	return definition
}

func storedDocumentAppDefinition(
	t *testing.T,
	document projectstate.Document,
) *appdefinitionpkg.AppDefinition {
	t.Helper()

	return mustDecodeStoredAppDefinition(t, appdefinitionpkg.StoredDocumentAppDefinitionRaw(document))
}

func withStoredDocumentAppDefinition(
	document projectstate.Document,
	raw projectstate.RawJSON,
) projectstate.Document {
	return appdefinitionpkg.WithStoredDocumentAppDefinition(document, raw)
}
