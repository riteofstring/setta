package pythonsdkcontracts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuild(t *testing.T) {
	t.Helper()

	contracts, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	for _, snippet := range []string{
		"SETTA_SDK_CONTRACT_VERSION = 2",
		"class SettaSDKContractBaseModel(BaseModel):",
		"__all__ = [",
	} {
		if !strings.Contains(contracts.PythonModule, snippet) {
			t.Fatalf("generated python sdk contracts missing %q:\n%s", snippet, contracts.PythonModule)
		}
	}
	if strings.Contains(contracts.PythonModule, "ConfigDict(extra=\"forbid\")") {
		t.Fatalf("generated python sdk contracts must not set extra=forbid on the shared base model")
	}
}

func TestBuildMatchesCheckedInPythonSDKContracts(t *testing.T) {
	t.Helper()

	contracts, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	repoRoot := testRepoRoot(t)
	contents, err := os.ReadFile(filepath.Join(repoRoot, GeneratedPythonModulePath))
	if err != nil {
		t.Fatalf("read %s: %v", GeneratedPythonModulePath, err)
	}
	if string(contents) != contracts.PythonModule {
		t.Fatalf("%s does not match generator output; run `./scripts/go.sh run ./cmd/setta-gen-python-sdk-contracts -out %s`", GeneratedPythonModulePath, GeneratedPythonModulePath)
	}
}

func testRepoRoot(t *testing.T) string {
	t.Helper()

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	return filepath.Clean(filepath.Join(wd, "..", ".."))
}
