package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestResolveLanguageServerCommandHonorsExplicitCommandOverride(t *testing.T) {
	t.Parallel()

	explicitCommand := filepath.Join(t.TempDir(), "basedpyright-langserver")
	command, args, err := resolveLanguageServerCommand(func(key string) (string, bool) {
		switch key {
		case lspCommandEnv:
			return explicitCommand, true
		case lspArgsEnv:
			return "--stdio --log-level debug", true
		default:
			return "", false
		}
	})
	if err != nil {
		t.Fatalf("resolve command override: %v", err)
	}
	if command != explicitCommand {
		t.Fatalf("expected explicit command %q, got %q", explicitCommand, command)
	}
	if !reflect.DeepEqual(args, []string{"--stdio", "--log-level", "debug"}) {
		t.Fatalf("unexpected explicit args %#v", args)
	}
}

func TestResolveLanguageServerCommandFallsBackToConfiguredInterpreter(t *testing.T) {
	t.Parallel()

	explicitInterpreter := filepath.Join(t.TempDir(), "python")
	command, args, err := resolveLanguageServerCommand(func(key string) (string, bool) {
		if key == pythonEnv {
			return explicitInterpreter, true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve interpreter fallback: %v", err)
	}
	if command != explicitInterpreter {
		t.Fatalf("expected interpreter %q, got %q", explicitInterpreter, command)
	}
	if !reflect.DeepEqual(args, []string{"-c", basedpyrightEntrypoint, "--stdio"}) {
		t.Fatalf("unexpected interpreter args %#v", args)
	}
}

func TestResolveLanguageServerCommandRequiresConfiguredInterpreter(t *testing.T) {
	t.Parallel()

	_, _, err := resolveLanguageServerCommand(func(string) (string, bool) {
		return "", false
	})
	if err == nil {
		t.Fatal("expected missing interpreter to fail")
	}
}

func TestResolveLanguageServerCommandExpandsHomeInExplicitCommandOverride(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	command, args, err := resolveLanguageServerCommand(func(key string) (string, bool) {
		switch key {
		case lspCommandEnv:
			return "~/bin/basedpyright-langserver", true
		case lspArgsEnv:
			return "--stdio", true
		default:
			return "", false
		}
	})
	if err != nil {
		t.Fatalf("resolve command override with home path: %v", err)
	}
	if command != filepath.Join(homeDir, "bin", "basedpyright-langserver") {
		t.Fatalf("expected expanded home command, got %q", command)
	}
	if !reflect.DeepEqual(args, []string{"--stdio"}) {
		t.Fatalf("unexpected explicit args %#v", args)
	}
}

func TestResolveLanguageServerCommandExpandsHomeEnvInConfiguredInterpreter(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	command, args, err := resolveLanguageServerCommand(func(key string) (string, bool) {
		if key == pythonEnv {
			return "$HOME/.venv/bin/python", true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve interpreter with home env: %v", err)
	}
	if command != filepath.Join(homeDir, ".venv", "bin", "python") {
		t.Fatalf("expected expanded interpreter, got %q", command)
	}
	if !reflect.DeepEqual(args, []string{"-c", basedpyrightEntrypoint, "--stdio"}) {
		t.Fatalf("unexpected interpreter args %#v", args)
	}
}
