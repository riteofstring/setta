package pythonsdkcontracts

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	addRepoVenvRuffToPath(t)

	contracts, err := Build()
	if err != nil {
		t.Fatalf("Build() error = %v", err)
	}
	repoRoot := testRepoRoot(t)
	formattedContracts, err := formatGeneratedContractsForPython(t, repoRoot, contracts.PythonModule)
	if err != nil {
		t.Fatalf("format generated python sdk contracts: %v", err)
	}
	contents, err := os.ReadFile(filepath.Join(repoRoot, GeneratedPythonModulePath))
	if err != nil {
		t.Fatalf("read %s: %v", GeneratedPythonModulePath, err)
	}
	if string(contents) != formattedContracts {
		t.Fatalf("%s does not match the canonical formatted generator output; run `./gcf.sh`", GeneratedPythonModulePath)
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

func addRepoVenvRuffToPath(t *testing.T) {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve generator_test.go path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
	venvBin := filepath.Join(repoRoot, ".venv", "bin")
	if _, err := os.Stat(filepath.Join(venvBin, "ruff")); err != nil {
		t.Fatalf("stat repo ruff binary: %v", err)
	}
	t.Setenv("PATH", venvBin+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func formatGeneratedContractsForPython(t *testing.T, repoRoot, contents string) (string, error) {
	t.Helper()

	outputDir := filepath.Join(repoRoot, filepath.Dir(GeneratedPythonModulePath))
	tempFile, err := os.CreateTemp(outputDir, "generated_sdk_contracts_test_*.py")
	if err != nil {
		return "", err
	}
	tempPath := tempFile.Name()
	t.Cleanup(func() {
		_ = os.Remove(tempPath)
	})
	if _, err := tempFile.WriteString(contents); err != nil {
		_ = tempFile.Close()
		return "", err
	}
	if err := tempFile.Close(); err != nil {
		return "", err
	}
	for _, args := range [][]string{
		{"check", "--quiet", "--select", "I", "--fix", tempPath},
		{"format", "--quiet", tempPath},
	} {
		cmd := exec.Command("ruff", args...)
		cmd.Dir = repoRoot
		output, err := cmd.CombinedOutput()
		if err != nil {
			return "", execError(err, output)
		}
	}
	formattedContents, err := os.ReadFile(tempPath)
	if err != nil {
		return "", err
	}
	return string(formattedContents), nil
}

func execError(err error, output []byte) error {
	if len(output) == 0 {
		return err
	}
	return &commandError{err: err, output: string(output)}
}

type commandError struct {
	err    error
	output string
}

func (e *commandError) Error() string {
	if strings.TrimSpace(e.output) == "" {
		return e.err.Error()
	}
	return strings.TrimSpace(e.output)
}
