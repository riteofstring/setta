package lsp

import (
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/pythonenv"
)

func TestResolveCurrentProcessCommandHonorsExplicitCommandOverride(t *testing.T) {
	t.Parallel()

	explicitCommand := filepath.Join(t.TempDir(), "basedpyright")
	command, args, err := resolveCurrentProcessCommand(func(key string) (string, bool) {
		switch key {
		case lspCommandEnv:
			return explicitCommand, true
		case lspArgsEnv:
			return "--stdio --log-level debug", true
		case pythonenv.InterpreterEnv:
			return filepath.Join(t.TempDir(), "python-should-not-be-used"), true
		default:
			return "", false
		}
	})
	if err != nil {
		t.Fatalf("resolve current-process command: %v", err)
	}
	if command != explicitCommand {
		t.Fatalf("expected explicit command %q, got %q", explicitCommand, command)
	}
	if !reflect.DeepEqual(args, []string{"--stdio", "--log-level", "debug"}) {
		t.Fatalf("expected explicit args, got %#v", args)
	}
}

func TestResolveCurrentProcessCommandUsesSharedInterpreterResolution(t *testing.T) {
	t.Parallel()

	explicitInterpreter := filepath.Join(t.TempDir(), "python-bin")
	command, args, err := resolveCurrentProcessCommand(func(key string) (string, bool) {
		switch key {
		case pythonenv.InterpreterEnv:
			return explicitInterpreter, true
		case pythonenv.LegacyLSPPythonEnv:
			return filepath.Join(t.TempDir(), "legacy-python"), true
		default:
			return "", false
		}
	})
	if err != nil {
		t.Fatalf("resolve shared interpreter command: %v", err)
	}
	if command != explicitInterpreter {
		t.Fatalf("expected shared interpreter %q, got %q", explicitInterpreter, command)
	}
	if !reflect.DeepEqual(args, []string{"-c", basedpyrightEntrypoint, "--stdio"}) {
		t.Fatalf("expected basedpyright stdio args, got %#v", args)
	}
}
