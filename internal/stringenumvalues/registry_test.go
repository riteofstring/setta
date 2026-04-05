package stringenumvalues_test

import (
	"reflect"
	"testing"

	"setta/internal/detachedruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/launcher"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/stringenumvalues"
)

func TestRegistryValuesForProjectStateEnum(t *testing.T) {
	t.Helper()

	values, ok, err := stringenumvalues.New().Values(
		reflect.TypeOf(projectstate.ChatPermissionMode("")),
	)
	if err != nil {
		t.Fatalf("Values() error = %v", err)
	}
	if !ok {
		t.Fatal("Values() did not resolve ChatPermissionMode")
	}
	if got, want := values, []stringenumvalues.EnumValue{
		{Name: "minimal", Value: "minimal"},
		{Name: "yolo", Value: "yolo"},
		{Name: "config_toml_custom", Value: "config_toml_custom"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ChatPermissionMode values = %#v, want %#v", got, want)
	}
}

func TestRegistryValuesForImportedConstBackedEnum(t *testing.T) {
	t.Helper()

	values, ok, err := stringenumvalues.New().Values(
		reflect.TypeOf(prompttemplates.Format("")),
	)
	if err != nil {
		t.Fatalf("Values() error = %v", err)
	}
	if !ok {
		t.Fatal("Values() did not resolve PromptFormat")
	}
	if got, want := values, []stringenumvalues.EnumValue{
		{Name: "Jinja", Value: "Jinja"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("PromptFormat values = %#v, want %#v", got, want)
	}
}

func TestRegistryValuesForImportedWrapperEnum(t *testing.T) {
	t.Helper()

	values, ok, err := stringenumvalues.New().Values(
		reflect.TypeOf(externalagentconfigs.ClaudeSettingsSource("")),
	)
	if err != nil {
		t.Fatalf("Values() error = %v", err)
	}
	if !ok {
		t.Fatal("Values() did not resolve ClaudeSettingsSource")
	}
	if got, want := values, []stringenumvalues.EnumValue{
		{Name: "user", Value: "user"},
		{Name: "project", Value: "project"},
		{Name: "local", Value: "local"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ClaudeSettingsSource values = %#v, want %#v", got, want)
	}
}

func TestRegistryValuesForImportedWrapperEnumWithoutLocalConsts(t *testing.T) {
	t.Helper()

	values, ok, err := stringenumvalues.New().Values(
		reflect.TypeOf(detachedruns.Status("")),
	)
	if err != nil {
		t.Fatalf("Values() error = %v", err)
	}
	if !ok {
		t.Fatal("Values() did not resolve DetachedRunStatus")
	}
	if got, want := values, []stringenumvalues.EnumValue{
		{Name: "queued", Value: "queued"},
		{Name: "running", Value: "running"},
		{Name: "exited", Value: "exited"},
		{Name: "failed", Value: "failed"},
		{Name: "canceled", Value: "canceled"},
		{Name: "lost", Value: "lost"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("DetachedRunStatus values = %#v, want %#v", got, want)
	}
}

func TestRegistryUsesValueNameWhenItIsIdentifierAndSuffixWhenItIsNot(t *testing.T) {
	t.Helper()

	values, ok, err := stringenumvalues.New().Values(
		reflect.TypeOf(launcher.LauncherOpenMode("")),
	)
	if err != nil {
		t.Fatalf("Values() error = %v", err)
	}
	if !ok {
		t.Fatal("Values() did not resolve LauncherOpenMode")
	}
	if got, want := values, []stringenumvalues.EnumValue{
		{Name: "browser", Value: "browser"},
		{Name: "ChromeApp", Value: "chrome-app"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("LauncherOpenMode values = %#v, want %#v", got, want)
	}
}

func TestRegistryValuesByTypeNameFallsBackAcrossPackages(t *testing.T) {
	t.Helper()

	values, ok, err := stringenumvalues.New().ValuesByTypeName(
		[]string{
			"setta/internal/frontendbindings",
			"setta/internal/projectstate",
			"setta/internal/artifacts",
			"setta/internal/runs",
		},
		"ChartType",
	)
	if err != nil {
		t.Fatalf("ValuesByTypeName(...) error = %v", err)
	}
	if !ok {
		t.Fatal("ValuesByTypeName(...) did not resolve ChartType")
	}
	if got, want := values, []stringenumvalues.EnumValue{
		{Name: "line", Value: "line"},
		{Name: "scatter", Value: "scatter"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("ChartType values = %#v, want %#v", got, want)
	}
}
