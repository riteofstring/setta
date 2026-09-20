package contracts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateArtifactsWritesAndChecksOnlyV2Artifacts(t *testing.T) {
	appRoot := t.TempDir()
	if err := generateArtifacts(appRoot, FixtureProjectSnapshotV2(), false); err != nil {
		t.Fatalf("generateArtifacts() error = %v", err)
	}

	contractPath := filepath.Join(appRoot, "src", "api", "generatedContract.ts")
	fixturePath := filepath.Join(appRoot, "backend", "internal", "contracts", "testdata", "project-snapshot-v2.json")
	contract, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", contractPath, err)
	}
	if string(contract) != string(TypeScriptV2()) {
		t.Fatal("generated TypeScript differs from TypeScriptV2()")
	}
	if !strings.Contains(string(contract), "PROJECT_SNAPSHOT_VERSION_V2") {
		t.Fatalf("generated TypeScript did not expose its V2 contract: %s", contract)
	}

	fixture, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", fixturePath, err)
	}
	if !strings.Contains(string(fixture), `"version": "v2"`) {
		t.Fatalf("fixture does not contain the V2 version: %s", fixture)
	}
	if err := generateArtifacts(appRoot, FixtureProjectSnapshotV2(), true); err != nil {
		t.Fatalf("generateArtifacts(check) error = %v", err)
	}

	if err := os.WriteFile(contractPath, []byte("drift\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", contractPath, err)
	}
	if err := generateArtifacts(appRoot, FixtureProjectSnapshotV2(), true); err == nil {
		t.Fatal("generateArtifacts(check) error = nil after contract drift")
	}
}
