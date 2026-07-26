package runtimeinstall

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"setta/internal/runtimeprovider"
)

func TestVerifierInstallerPublishesPinnedBytesBeforeSelectingPath(t *testing.T) {
	request, verifier := verifierInstallFixture(t)
	temporaryPath := DefaultLayout().ReleaseRoot + "/.incoming-setta-release-verify-" + request.SHA256[:16]
	executor := &scriptedRuntimeExecutor{responses: []runtimeprovider.ExecResult{
		{ExitCode: 1}, {ExitCode: 1}, {}, {}, {},
		{Stdout: []byte(request.SHA256 + "  " + temporaryPath + "\n")},
		{}, {}, {}, {Stdout: []byte(request.SHA256 + "  " + request.RemotePath + "\n")},
	}}
	if err := (VerifierInstaller{Executor: executor}).Ensure(context.Background(), request); err != nil {
		t.Fatal(err)
	}
	if len(executor.requests) != 10 {
		t.Fatalf("exec requests = %d, want 10", len(executor.requests))
	}
	upload := executor.requests[3]
	if upload.Path != "/usr/bin/dd" || !slices.Equal(upload.Stdin, verifier) {
		t.Fatalf("upload request = %+v", upload)
	}
	if executor.requests[4].Path != "/bin/chmod" || executor.requests[4].Arguments[0] != "0600" {
		t.Fatalf("staged verifier was not protected before hashing: %+v", executor.requests[4])
	}
	if executor.requests[8].Path != "/bin/mv" || executor.requests[9].Path != "/usr/bin/sha256sum" {
		t.Fatalf("publish/final verification requests = %+v", executor.requests[8:])
	}
	for _, call := range executor.requests {
		if call.Path == "/bin/sh" || call.Path == "/usr/bin/env" {
			t.Fatalf("verifier installer used a shell: %+v", call)
		}
	}
}

func TestVerifierInstallerAdoptsOnlyExactRegularExistingVerifier(t *testing.T) {
	t.Run("exact", func(t *testing.T) {
		request, _ := verifierInstallFixture(t)
		executor := &scriptedRuntimeExecutor{responses: []runtimeprovider.ExecResult{
			{ExitCode: 1}, {}, {Stdout: []byte(request.SHA256 + "  " + request.RemotePath + "\n")},
			{}, {}, {Stdout: []byte(request.SHA256 + "  " + request.RemotePath + "\n")},
		}}
		if err := (VerifierInstaller{Executor: executor}).Ensure(context.Background(), request); err != nil {
			t.Fatal(err)
		}
		if len(executor.requests) != 6 || executor.requests[3].Path != "/bin/chown" {
			t.Fatalf("existing verifier requests = %+v", executor.requests)
		}
	})
	t.Run("digest drift", func(t *testing.T) {
		request, _ := verifierInstallFixture(t)
		executor := &scriptedRuntimeExecutor{responses: []runtimeprovider.ExecResult{
			{ExitCode: 1}, {}, {Stdout: []byte(strings.Repeat("0", 64) + "  " + request.RemotePath + "\n")},
		}}
		if err := (VerifierInstaller{Executor: executor}).Ensure(context.Background(), request); err == nil {
			t.Fatal("verifier installer overwrote drifted existing content")
		}
		if len(executor.requests) != 3 {
			t.Fatalf("digest drift made mutation calls: %+v", executor.requests)
		}
	})
	t.Run("symlink", func(t *testing.T) {
		request, _ := verifierInstallFixture(t)
		executor := &scriptedRuntimeExecutor{responses: []runtimeprovider.ExecResult{{}}}
		if err := (VerifierInstaller{Executor: executor}).Ensure(context.Background(), request); err == nil {
			t.Fatal("verifier installer adopted a remote symlink")
		}
		if len(executor.requests) != 1 {
			t.Fatalf("symlink made additional calls: %+v", executor.requests)
		}
	})
}

func TestVerifierInstallerRejectsChangedLocalInputBeforeProviderCalls(t *testing.T) {
	request, _ := verifierInstallFixture(t)
	if err := os.WriteFile(request.LocalPath, []byte("changed"), 0o600); err != nil {
		t.Fatal(err)
	}
	executor := &scriptedRuntimeExecutor{}
	if err := (VerifierInstaller{Executor: executor}).Ensure(context.Background(), request); err == nil {
		t.Fatal("verifier installer accepted changed local bytes")
	}
	if len(executor.requests) != 0 {
		t.Fatalf("invalid local input made provider calls: %+v", executor.requests)
	}
}

func verifierInstallFixture(t *testing.T) (VerifierInstallRequest, []byte) {
	t.Helper()
	identity, err := runtimeprovider.NewManagedIdentity("runtime-verifier-test")
	if err != nil {
		t.Fatal(err)
	}
	verifier := []byte("pinned verifier bytes")
	digest := sha256.Sum256(verifier)
	localPath := filepath.Join(t.TempDir(), "setta-release-verify")
	if err := os.WriteFile(localPath, verifier, 0o600); err != nil {
		t.Fatal(err)
	}
	return VerifierInstallRequest{
		RuntimeName: identity.Name, LocalPath: localPath,
		RemotePath: DefaultLayout().ReleaseRoot + "/setta-release-verify",
		SHA256:     hex.EncodeToString(digest[:]),
	}, verifier
}

type scriptedRuntimeExecutor struct {
	requests  []runtimeprovider.ExecRequest
	responses []runtimeprovider.ExecResult
}

func (executor *scriptedRuntimeExecutor) Exec(_ context.Context, request runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error) {
	executor.requests = append(executor.requests, request)
	if len(executor.responses) == 0 {
		return runtimeprovider.ExecResult{}, nil
	}
	response := executor.responses[0]
	executor.responses = executor.responses[1:]
	return response, nil
}
