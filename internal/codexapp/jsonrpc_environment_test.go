package codexapp

import (
	"reflect"
	"testing"
)

func TestProcessEnvironmentExcludesValuesAndAppliesExactOverrides(t *testing.T) {
	inherited := []string{
		"PATH=/usr/bin",
		"OPENAI_API_KEY=parent-secret",
		"CODEX_EXEC_SERVER_URL=ws://stale.example.invalid",
		"SETTA_MODE=parent",
	}
	overrides := []string{
		"OPENAI_API_KEY=override-secret",
		"CODEX_EXEC_SERVER_URL=ws://stale-override.example.invalid",
		"CODEX_EXEC_SERVER_URL=ws://127.0.0.1:4500",
		"SETTA_MODE=stale-child",
		"SETTA_MODE=child",
	}
	want := []string{
		"PATH=/usr/bin",
		"CODEX_EXEC_SERVER_URL=ws://127.0.0.1:4500",
		"SETTA_MODE=child",
	}

	got := processEnvironment(inherited, overrides, []string{"OPENAI_API_KEY"})
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("process environment = %q, want %q", got, want)
	}
	if inherited[1] != "OPENAI_API_KEY=parent-secret" || overrides[0] != "OPENAI_API_KEY=override-secret" {
		t.Fatal("process environment inputs were mutated")
	}
}
