package project

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestTemporaryStoreMaterializesFinalGeneratedFileAndCleansUp(t *testing.T) {
	provider := &recordingProvider{resolver: func(context.Context, SignatureRequest) (CallableSignature, error) {
		return squareRootSignature(), nil
	}}
	store, err := NewTemporaryStore(provider)
	if err != nil {
		t.Fatalf("NewTemporaryStore() error = %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})

	path := store.GeneratedFilePath()
	if filepath.Base(path) != "setta_gen.py" {
		t.Fatalf("GeneratedFilePath() = %q, want a setta_gen.py artifact", path)
	}
	const wantInitialCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        pass\n\nstate = SettaState()"
	requireMaterializedCode(t, path, wantInitialCode)

	callableSnapshot, err := store.CommitCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sqrt",
	)
	if err != nil {
		t.Fatalf("CommitCallable() error = %v", err)
	}
	_, err = setParameterExpression(store, callableSnapshot, "3")
	if err != nil {
		t.Fatalf("SetCallableParameters() error = %v", err)
	}

	const wantFinalCode = "import math\n\nclass SettaState:\n    def __init__(state):\n        state.Square_Root__x = 3\n        state.Square_Root = math.sqrt(state.Square_Root__x)\n\nstate = SettaState()"
	requireMaterializedCode(t, path, wantFinalCode)

	workspace := filepath.Dir(path)
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if _, err := os.Stat(workspace); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temporary workspace stat error = %v, want not exist", err)
	}
	_, err = setParameterExpression(store, callableSnapshot, "4")
	if !errors.Is(err, ErrStoreClosed) {
		t.Fatalf("SetCallableParameters() after Close error = %v, want closed store", err)
	}
}

func requireMaterializedCode(t *testing.T, path string, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	if string(got) != want {
		t.Fatalf("generated file = %q, want %q", got, want)
	}
}
