package codexapp

import (
	"errors"
	"strings"
	"testing"
)

func TestEnsureCodexAppServerFileDescriptorLimitRaisesToHardLimit(t *testing.T) {
	current := fileDescriptorLimit{Soft: 256, Hard: 4096}
	var setSoftCalls []uint64
	diagnostic, err := ensureCodexAppServerFileDescriptorLimit(fileDescriptorLimitOperations{
		get: func() (fileDescriptorLimit, error) {
			return current, nil
		},
		setSoft: func(soft uint64) error {
			setSoftCalls = append(setSoftCalls, soft)
			current.Soft = soft
			return nil
		},
	})
	if err != nil {
		t.Fatalf("ensure file descriptor limit: %v", err)
	}
	if len(setSoftCalls) != 1 || setSoftCalls[0] != 4096 {
		t.Fatalf("set soft calls = %v, want [4096]", setSoftCalls)
	}
	if diagnostic.Before.Soft != 256 || diagnostic.After.Soft != 4096 || diagnostic.Minimum != codexAppServerMinimumFileDescriptorLimit {
		t.Fatalf("diagnostic = %+v, want before 256 after 4096 minimum %d", diagnostic, codexAppServerMinimumFileDescriptorLimit)
	}
}

func TestEnsureCodexAppServerFileDescriptorLimitCallsSetrlimitEvenWhenAlreadyRaised(t *testing.T) {
	current := fileDescriptorLimit{Soft: 4096, Hard: 4096}
	var setSoftCalls []uint64
	_, err := ensureCodexAppServerFileDescriptorLimit(fileDescriptorLimitOperations{
		get: func() (fileDescriptorLimit, error) {
			return current, nil
		},
		setSoft: func(soft uint64) error {
			setSoftCalls = append(setSoftCalls, soft)
			current.Soft = soft
			return nil
		},
	})
	if err != nil {
		t.Fatalf("ensure file descriptor limit: %v", err)
	}
	if len(setSoftCalls) != 1 || setSoftCalls[0] != 4096 {
		t.Fatalf("set soft calls = %v, want [4096]", setSoftCalls)
	}
}

func TestEnsureCodexAppServerFileDescriptorLimitFailsWhenHardLimitIsTooLow(t *testing.T) {
	current := fileDescriptorLimit{Soft: 256, Hard: 256}
	_, err := ensureCodexAppServerFileDescriptorLimit(fileDescriptorLimitOperations{
		get: func() (fileDescriptorLimit, error) {
			return current, nil
		},
		setSoft: func(soft uint64) error {
			current.Soft = soft
			return nil
		},
	})
	if err == nil || !strings.Contains(err.Error(), "Codex app-server has a low file descriptor limit: 256") {
		t.Fatalf("error = %v, want low file descriptor diagnostic", err)
	}
}

func TestEnsureCodexAppServerFileDescriptorLimitFailsWhenExplicitRaiseFails(t *testing.T) {
	raiseErr := errors.New("permission denied")
	_, err := ensureCodexAppServerFileDescriptorLimit(fileDescriptorLimitOperations{
		get: func() (fileDescriptorLimit, error) {
			return fileDescriptorLimit{Soft: 256, Hard: 4096}, nil
		},
		setSoft: func(uint64) error {
			return raiseErr
		},
	})
	if err == nil || !strings.Contains(err.Error(), "raise codex app-server file descriptor limit to hard limit 4096: permission denied") {
		t.Fatalf("error = %v, want explicit raise failure", err)
	}
}

func TestEnsureCodexAppServerFileDescriptorLimitSkipsUnsupportedPlatform(t *testing.T) {
	diagnostic, err := ensureCodexAppServerFileDescriptorLimit(fileDescriptorLimitOperations{})
	if err != nil {
		t.Fatalf("ensure unsupported file descriptor limit: %v", err)
	}
	if diagnostic.Supported {
		t.Fatalf("diagnostic = %+v, want unsupported", diagnostic)
	}
}

func TestIsCodexAppServerCommand(t *testing.T) {
	tests := []struct {
		name    string
		command string
		args    []string
		want    bool
	}{
		{name: "default codex app server", command: "codex", args: []string{"app-server", "--listen", "stdio://"}, want: true},
		{name: "codex path", command: "/opt/homebrew/bin/codex", args: []string{"app-server"}, want: true},
		{name: "windows codex path", command: `C:\bin\codex.exe`, args: []string{"app-server"}, want: true},
		{name: "other codex command", command: "codex", args: []string{"exec"}, want: false},
		{name: "test fake app server", command: "/tmp/setta-test", args: []string{"-test.run=TestCodexAppFakeServer", "--"}, want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isCodexAppServerCommand(test.command, test.args); got != test.want {
				t.Fatalf("isCodexAppServerCommand(%q, %v) = %t, want %t", test.command, test.args, got, test.want)
			}
		})
	}
}
