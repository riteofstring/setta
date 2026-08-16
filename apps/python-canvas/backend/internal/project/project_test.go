package project

import (
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

func TestInitialProjectSnapshotIsCanonicalV1State(t *testing.T) {
	snapshot := InitialProjectSnapshot()
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("InitialProjectSnapshot().Validate() error = %v", err)
	}
	if snapshot.Project.ID != "project:python-canvas" || snapshot.Project.Revision != 1 {
		t.Fatalf("project = %#v, want stable ID and revision 1", snapshot.Project)
	}
	if snapshot.PythonTarget.Prefix != "import math" || snapshot.PythonTarget.Suffix != "state = SettaState()" {
		t.Fatalf("python target = %#v", snapshot.PythonTarget)
	}
	if len(snapshot.Callables) != 1 {
		t.Fatalf("len(callables) = %d, want 1", len(snapshot.Callables))
	}
	callable := snapshot.Callables[0]
	if callable.ID != "callable:square-root" || callable.Name != "Square Root" {
		t.Fatalf("callable = %#v", callable)
	}
	if callable.AuthoredExpression != "" || len(callable.ParameterIDs) != 0 || len(snapshot.Parameters) != 0 {
		t.Fatalf("initial authored state = callable %#v, parameters %#v", callable, snapshot.Parameters)
	}
	if snapshot.GeneratedCode.Body != "" {
		t.Fatalf("generated body = %q, want empty", snapshot.GeneratedCode.Body)
	}
	if snapshot.ProviderStatus.Provider != contracts.ProviderBasedpyrightV1 ||
		snapshot.ProviderStatus.Status != contracts.ProviderAvailabilityUnavailableV1 ||
		snapshot.ProviderStatus.State != contracts.ProviderLifecycleStateNotStartedV1 {
		t.Fatalf("provider status = %#v", snapshot.ProviderStatus)
	}
}
