package pythonsharedconstants

import (
	"fmt"
	"strings"
	"testing"
	"time"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/localsessions"
	"setta/internal/projectstate"
	"setta/internal/pythonsdklocalcore"
	"setta/internal/watchcodecontracts"
	"setta/internal/workspacelaunch"
)

func TestBuildIncludesGoOwnedMemorableNameWordLists(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expected := []string{
		fmt.Sprintf(
			"MEMORABLE_NAME_ADJECTIVES = %s",
			pythonStringTupleExpr(projectstate.MemorableNameAdjectives()),
		),
		fmt.Sprintf(
			"MEMORABLE_NAME_NOUNS = %s",
			pythonStringTupleExpr(projectstate.MemorableNameNouns()),
		),
		fmt.Sprintf(
			"MEMORABLE_NAME_VERBS = %s",
			pythonStringTupleExpr(projectstate.MemorableNameVerbs()),
		),
	}
	for _, snippet := range expected {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated constants missing %q", snippet)
		}
	}
}

func TestBuildIncludesGoOwnedSessionProcessRecognitionConstants(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expected := []string{
		fmt.Sprintf(
			"SESSION_PROCESS_BASENAMES = %s",
			pythonFrozenStringSetExpr(localsessions.RecognizedSessionProcessBasenames()),
		),
		fmt.Sprintf(
			"SESSION_PROCESS_INVOCATION_ARGUMENTS = %s",
			pythonFrozenStringSetExpr(localsessions.RecognizedSessionInvocationArguments()),
		),
		fmt.Sprintf(
			"SESSION_PROCESS_INVOCATION_PREFIXES = %s",
			pythonStringTupleExpr(localsessions.RecognizedSessionInvocationPrefixes()),
		),
	}
	for _, snippet := range expected {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated constants missing %q", snippet)
		}
	}
}

func TestBuildIncludesGoOwnedLaunchIntentTTL(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expected := fmt.Sprintf(
		"LAUNCH_INTENT_TOKEN_TTL_SECONDS = %d",
		int(workspacelaunch.DefaultIntentTTL/time.Second),
	)
	if !strings.Contains(generated.PythonModule, expected) {
		t.Fatalf("generated constants missing %q", expected)
	}
}

func TestBuildIncludesGoOwnedAppSubsystemBackendContract(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expectedSnippets := []string{
		fmt.Sprintf(
			"APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION = %d",
			backendruntime.AppSubsystemBackendContractVersion,
		),
		fmt.Sprintf(
			"APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_NAMES = %s",
			pythonStringTupleExpr(backendruntime.RequiredListenerEndpointNames()),
		),
		fmt.Sprintf(
			"APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND = MappingProxyType(%s)",
			pythonStringDictExpr(appSubsystemBackendListenerEndpointCommandMap()),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_GET_APP_DEFINITION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandGetAppDefinition),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandGetEffectiveAppDefinition),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandGetEffectiveAppSpecPath),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandGetEffectiveAppThemeMode),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandValidateAppDefinition),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_SET_APP_DEFINITION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandSetAppDefinition),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandStreamAppDefinition),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandUpdateAppDefinition),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionCatalogID),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionSpecVersion),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionSpecPath),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandCompareAndSetAppDefinitionThemeMode),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandWatchCodeGetProjectData),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandWatchCodeSetInputs),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_WATCH_CODE_SET_FOLDERS = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandWatchCodeSetFolders),
		),
		fmt.Sprintf(
			"LOCAL_CORE_COMMAND_WATCH_CODE_SET_FILES = %s",
			pythonStringLiteral(pythonsdklocalcore.CommandWatchCodeSetFiles),
		),
	}
	for _, snippet := range expectedSnippets {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated constants missing %q", snippet)
		}
	}
}

func TestBuildIncludesGoOwnedWatchCodeBackendContract(t *testing.T) {
	generated, err := Build()
	if err != nil {
		t.Fatalf("build generated constants: %v", err)
	}

	expectedSnippets := []string{
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_CONTRACT_VERSION = %d",
			watchcodecontracts.BackendContractVersion,
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_ROUTE_SUFFIXES = %s",
			pythonStringTupleExpr(watchcodecontracts.BackendRouteSuffixes()),
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_ROUTE_SUFFIX_INPUTS = %s",
			pythonStringLiteral(watchcodecontracts.BackendRouteSuffixInputs),
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_LOCAL_SETTING_IDS = %s",
			pythonStringTupleExpr(watchcodecontracts.BackendLocalSettingIDs()),
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_READ_HANDLER_BY_LOCAL_SETTING_ID = MappingProxyType(%s)",
			pythonStringDictExpr(watchcodecontracts.BackendReadHandlerByLocalSettingID()),
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_WRITE_HANDLER_BY_LOCAL_SETTING_ID = MappingProxyType(%s)",
			pythonStringDictExpr(watchcodecontracts.BackendWriteHandlerByLocalSettingID()),
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_ERROR_PROVIDER_REQUIRED = %s",
			pythonStringLiteral(watchcodecontracts.BackendErrorProviderRequired),
		),
		fmt.Sprintf(
			"WATCH_CODE_BACKEND_ERROR_INVALID_WATCH_CODE_INPUT = %s",
			pythonStringLiteral(watchcodecontracts.BackendErrorInvalidWatchCodeInput),
		),
	}
	for _, snippet := range expectedSnippets {
		if !strings.Contains(generated.PythonModule, snippet) {
			t.Fatalf("generated constants missing %q", snippet)
		}
	}
}

func TestPythonFrozenStringSetExprSingleValue(t *testing.T) {
	got := pythonFrozenStringSetExpr([]string{"setta"})
	if got != `frozenset(("setta",))` {
		t.Fatalf("expected single-value frozenset expression, got %q", got)
	}
}
