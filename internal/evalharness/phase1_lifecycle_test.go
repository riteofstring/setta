package evalharness

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/evalharness/providerbridge"
	"setta/internal/evalharness/volumecopy"
	"setta/internal/httpapi"
	settaruntime "setta/internal/runtime"
)

func TestDecodePhase1BackendReadyRequiresOneExactProductionEvent(t *testing.T) {
	event := settaruntime.ReadyEvent{
		Event:           "ready",
		Addr:            "0.0.0.0:4310",
		BootstrapToken:  "bootstrap-token",
		ProtocolVersion: httpapi.ProtocolVersion,
	}
	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("encode ready event: %v", err)
	}
	ready, found, err := decodePhase1BackendReady("startup diagnostic\n" + string(encoded) + "\n")
	if err != nil {
		t.Fatalf("decode ready event: %v", err)
	}
	if !found || ready != event {
		t.Fatalf("decoded ready event = %#v, %t", ready, found)
	}
	if _, _, err := decodePhase1BackendReady(string(encoded) + "\n" + string(encoded)); err == nil {
		t.Fatal("duplicate ready events were accepted")
	}

	event.Addr = "127.0.0.1:4310"
	encoded, err = json.Marshal(event)
	if err != nil {
		t.Fatalf("encode invalid ready event: %v", err)
	}
	if _, _, err := decodePhase1BackendReady(string(encoded)); err == nil {
		t.Fatal("unexpected backend binding was accepted")
	}
}

func TestPhase1ProviderEnvironmentScrubsCredentialsAndStaleControl(t *testing.T) {
	environment := phase1ProviderEnvironment(
		[]string{
			"HOME=/developer",
			"OPENAI_API_KEY=secret",
			"CODEX_ACCESS_TOKEN=secret",
			"CODEX_EXEC_SERVER_URL=ws://stale.example.invalid",
			providerbridge.TokenEnvironment + "=secret",
		},
		"CODEX_EXEC_SERVER_URL=ws://127.0.0.1:4500",
	)
	want := []string{
		"HOME=/developer",
		"CODEX_EXEC_SERVER_URL=ws://127.0.0.1:4500",
	}
	if strings.Join(environment, "\n") != strings.Join(want, "\n") {
		t.Fatalf("provider environment = %q", environment)
	}
}

func TestValidPhase1ImageIDRequiresExactLowercaseDigest(t *testing.T) {
	valid := "sha256:" + strings.Repeat("a", 64)
	if !validPhase1ImageID(valid) {
		t.Fatal("exact lowercase image id was rejected")
	}
	for _, invalid := range []string{
		strings.Repeat("a", 64),
		"sha256:" + strings.Repeat("A", 64),
		"sha256:" + strings.Repeat("a", 63),
		"setta-eval:latest",
	} {
		if validPhase1ImageID(invalid) {
			t.Fatalf("invalid image id %q was accepted", invalid)
		}
	}
}

func TestPhase1InvalidWorkspaceCopyBecomesVerifierFailure(t *testing.T) {
	copyResult := volumecopy.InvalidWorkspaceResult("Final workspace exceeds the file-count limit.")
	if err := copyResult.Validate(); err != nil {
		t.Fatalf("validate volume-copy result: %v", err)
	}
	result := phase1InvalidWorkspaceVerifierResult(copyResult.Detail)
	if err := result.Validate(); err != nil {
		t.Fatalf("validate verifier result: %v", err)
	}
	if result.Passed || len(result.Checks) != 1 || result.Checks[0].ID != "workspace_snapshot" {
		t.Fatalf("invalid-workspace verifier result = %#v", result)
	}
}
