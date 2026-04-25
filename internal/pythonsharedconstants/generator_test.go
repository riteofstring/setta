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
			"%s: %s",
			pythonStringLiteral(backendruntime.ListenerEndpointValidateAppDefinition),
			pythonStringLiteral(pythonsdklocalcore.CommandValidateAppDefinition),
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
