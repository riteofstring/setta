package contracts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateArtifactsWritesAndChecksBothArtifacts(t *testing.T) {
	appRoot := t.TempDir()
	if err := generateArtifacts(appRoot, validSnapshotForTest(), false); err != nil {
		t.Fatalf("generateArtifacts() error = %v", err)
	}

	contractPath := filepath.Join(appRoot, "src", "backend", "generatedContract.ts")
	fixturePath := filepath.Join(appRoot, "backend", "internal", "contracts", "testdata", "project-snapshot-v1.json")
	contract, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", contractPath, err)
	}
	if string(contract) != string(TypeScriptV1()) {
		t.Fatalf("generated TypeScript differs from TypeScriptV1()")
	}
	fixture, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", fixturePath, err)
	}
	if !strings.Contains(string(fixture), "\"version\": \"v1\"") {
		t.Fatalf("fixture does not contain the V1 version: %s", fixture)
	}

	if err := generateArtifacts(appRoot, validSnapshotForTest(), true); err != nil {
		t.Fatalf("generateArtifacts(check) error = %v", err)
	}
	if err := os.WriteFile(contractPath, []byte("drift\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", contractPath, err)
	}
	if err := generateArtifacts(appRoot, validSnapshotForTest(), true); err == nil {
		t.Fatal("generateArtifacts(check) error = nil after contract drift")
	}
	if err := generateArtifacts(appRoot, validSnapshotForTest(), false); err != nil {
		t.Fatalf("generateArtifacts() error = %v while correcting contract drift", err)
	}
	if err := os.WriteFile(fixturePath, []byte("drift\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", fixturePath, err)
	}
	if err := generateArtifacts(appRoot, validSnapshotForTest(), true); err == nil {
		t.Fatal("generateArtifacts(check) error = nil after fixture drift")
	}
}

func TestMarshalProjectSnapshotV1RejectsUnsupportedVersion(t *testing.T) {
	snapshot := validSnapshotForTest()
	snapshot.Version = "v0"

	if _, err := marshalProjectSnapshotV1(snapshot); err == nil {
		t.Fatal("marshalProjectSnapshotV1() error = nil for an unsupported version")
	}
}
