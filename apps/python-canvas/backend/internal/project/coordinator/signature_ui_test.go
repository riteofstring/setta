package coordinator

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/projectfile"
)

func TestSignatureRefreshPreservesAuthoredControls(t *testing.T) {
	t.Parallel()
	state := durableState(t)
	ui := aggregate.ParameterUI{
		Type:    aggregate.ParameterUITypeSlider,
		Numeric: &aggregate.NumericUIConfiguration{Min: 0, Max: 10, Step: 1},
	}
	state.ParameterUIOverrides = map[string]aggregate.ParameterUI{"parameter-provider": ui}
	path := filepath.Join(t.TempDir(), "project.json")
	files := projectfile.NewAdapter()
	if err := files.Create(path, state); err != nil {
		t.Fatal(err)
	}
	provider := readyProvider()
	provider.signature = []aggregate.ProviderParameter{
		{Name: "value", PassingStyle: aggregate.PassingStylePositionalOrKeyword, TypeAnnotation: stringPointer("int")},
		{Name: "extra", PassingStyle: aggregate.PassingStyleKeywordOnly, Default: stringPointer("0")},
	}
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, Files: files, IDGenerator: sequenceIDs("value-refreshed", "extra-parameter"),
		Materializer: newMaterialization(t, path), Provider: provider,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer coordinator.Close()
	refreshed, err := coordinator.RefreshCallableParameters(context.Background(), aggregate.RefreshCallableParametersCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, CallableID: "callable-dynamic",
	})
	if err != nil {
		t.Fatalf("refreshing a callable with a slider: %v", err)
	}
	if !reflect.DeepEqual(refreshed.State.ParameterUIOverrides["value-refreshed"], ui) {
		t.Fatal("refresh discarded the authored slider")
	}
	parameters := refreshed.State.Callables[0].Parameters
	if len(parameters) != 2 || parameters[0].Name != "value" || parameters[1].Name != "extra" {
		t.Fatalf("refreshed parameters = %#v", parameters)
	}
	loaded, err := files.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(loaded, refreshed.State) {
		t.Fatal("refreshed controls and parameters were not durably saved")
	}
}
