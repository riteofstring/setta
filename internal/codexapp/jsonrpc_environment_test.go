package codexapp

import (
	"reflect"
	"testing"
)

func TestProcessEnvironmentExcludesInheritedAndOverrideValues(t *testing.T) {
	inherited := []string{
		"PATH=/usr/bin",
		"SETTA_OPENAI_SPEECH_API_KEY=parent-secret",
		"SETTA_MODE=parent",
	}
	overrides := []string{
		"SETTA_OPENAI_SPEECH_API_KEY=override-secret",
		"SETTA_MODE=child",
	}
	want := []string{
		"PATH=/usr/bin",
		"SETTA_MODE=parent",
		"SETTA_MODE=child",
	}

	got := processEnvironment(inherited, overrides, []string{"SETTA_OPENAI_SPEECH_API_KEY"})
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("process environment = %q, want %q", got, want)
	}
	if inherited[1] != "SETTA_OPENAI_SPEECH_API_KEY=parent-secret" || overrides[0] != "SETTA_OPENAI_SPEECH_API_KEY=override-secret" {
		t.Fatal("process environment inputs were mutated")
	}
}
