package pythonsdkcontracts

import (
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
