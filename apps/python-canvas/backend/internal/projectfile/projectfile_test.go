package projectfile

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func TestCreateLoadAndEncodeRoundTripStrictAuthoredState(t *testing.T) {
	t.Parallel()

	adapter := NewAdapter()
	state := validState()
	path := filepath.Join(t.TempDir(), "project.json")
	if err := adapter.Create(path, state); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if err := adapter.Create(path, state); !errors.Is(err, ErrProjectFileExists) {
		t.Fatalf("Create(existing) error = %v, want exclusive-create failure", err)
	}
	loaded, err := adapter.Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !reflect.DeepEqual(loaded, state) {
		t.Fatalf("loaded state = %#v\nwant: %#v", loaded, state)
	}
	first, err := Encode(state)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}
	second, err := Encode(state)
	if err != nil {
		t.Fatalf("second Encode() error = %v", err)
	}
	if string(first) != string(second) {
		t.Fatalf("encoded project bytes are not stable:\nfirst: %s\nsecond: %s", first, second)
	}
	encoded := string(first)
	for _, want := range []string{
		`"format": "python-canvas-project/v2"`,
		`"nameEditable": false`,
		`"providerOrdinal": 0`,
		`"nameEditable": true`,
		`"providerOrdinal": null`,
	} {
		if !strings.Contains(encoded, want) {
			t.Fatalf("encoded project does not retain %q:\n%s", want, encoded)
		}
	}
	if strings.Contains(encoded, "generatedCode") || strings.Contains(encoded, "diagnostics") {
		t.Fatalf("encoded project contains derived state:\n%s", encoded)
	}
}

func TestDecodeRejectsUnknownMissingWrongAndIncoherentFields(t *testing.T) {
	t.Parallel()

	encoded, err := Encode(validState())
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}
	base := string(encoded)
	for _, testCase := range []struct {
		name    string
		content func(t *testing.T) []byte
	}{
		{
			name: "unknown derived top-level field",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				document["generatedCode"] = map[string]any{}
				return marshalDocument(t, document)
			},
		},
		{
			name: "missing required project field",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				delete(document["project"].(map[string]any), "name")
				return marshalDocument(t, document)
			},
		},
		{
			name: "wrong revision JSON type",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				document["project"].(map[string]any)["revision"] = "7"
				return marshalDocument(t, document)
			},
		},
		{
			name: "duplicate field",
			content: func(t *testing.T) []byte {
				return []byte(strings.Replace(base, `"format": "python-canvas-project/v2"`, `"format": "python-canvas-project/v2", "format": "python-canvas-project/v2"`, 1))
			},
		},
		{
			name: "provider ordinal missing from provider row",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				firstParameter(t, document)["providerOrdinal"] = nil
				return marshalDocument(t, document)
			},
		},
		{
			name: "app row carries fabricated provider metadata",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				parameters := firstCallable(t, document)["parameters"].([]any)
				parameters[1].(map[string]any)["typeAnnotation"] = "fabricated"
				return marshalDocument(t, document)
			},
		},
		{
			name: "duplicate stable ID",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				parameters := firstCallable(t, document)["parameters"].([]any)
				parameters[1].(map[string]any)["id"] = parameters[0].(map[string]any)["id"]
				return marshalDocument(t, document)
			},
		},
		{
			name: "unsupported format",
			content: func(t *testing.T) []byte {
				document := documentMap(t, encoded)
				document["format"] = "python-canvas-project/v0"
				return marshalDocument(t, document)
			},
		},
		{
			name: "trailing JSON document",
			content: func(t *testing.T) []byte {
				return append(append([]byte{}, encoded...), []byte("{}")...)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := Decode(testCase.content(t))
			if !errors.Is(err, ErrInvalidProjectFile) {
				t.Fatalf("Decode() error = %v, want strict project-file failure", err)
			}
		})
	}
}

func TestStageUsesTargetDirectoryAndFailureLeavesCurrentFileUntouched(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	path := filepath.Join(directory, "project.json")
	previous := validState()
	next := previous.Clone()
	next.Project.Name = "Renamed project"
	next.Project.Revision++
	production := NewAdapter()
	if err := production.Create(path, previous); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(before) error = %v", err)
	}

	injected := errors.New("injected replace failure")
	adapter := newAdapterForTest(func(source string, destination string) error {
		if filepath.Dir(source) != filepath.Dir(destination) {
			t.Fatalf("replace crossed filesystems: %q -> %q", source, destination)
		}
		return injected
	})
	staged, err := adapter.Stage(path, next)
	if err != nil {
		t.Fatalf("Stage() error = %v", err)
	}
	if filepath.Dir(staged.temporaryPath) != directory {
		t.Fatalf("staged path = %q, want sibling of %q", staged.temporaryPath, path)
	}
	if err := staged.Commit(); !errors.Is(err, injected) {
		t.Fatalf("Commit() error = %v, want injected replace failure", err)
	}
	afterFailure, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(after failure) error = %v", err)
	}
	if string(afterFailure) != string(before) {
		t.Fatalf("failed replacement changed project bytes:\n got: %s\nwant: %s", afterFailure, before)
	}
	stagedPath := staged.temporaryPath
	if err := staged.Discard(); err != nil {
		t.Fatalf("Discard() error = %v", err)
	}
	if _, err := os.Stat(stagedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("discarded staged file stat error = %v, want not exist", err)
	}
}

func TestReplaceAtomicallyInstallsValidatedProjectBytes(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	previous := validState()
	next := previous.Clone()
	next.Project.Name = "Renamed project"
	next.Project.Revision++
	adapter := NewAdapter()
	if err := adapter.Create(path, previous); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if err := adapter.Replace(path, next); err != nil {
		t.Fatalf("Replace() error = %v", err)
	}
	loaded, err := adapter.Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !reflect.DeepEqual(loaded, next) {
		t.Fatalf("replaced project = %#v\nwant: %#v", loaded, next)
	}
	if _, err := adapter.Load(filepath.Join(t.TempDir(), "missing.json")); !errors.Is(err, ErrProjectFileMissing) {
		t.Fatalf("Load(missing) error = %v, want missing-file error", err)
	}
}

func validState() aggregate.State {
	typeAnnotation := "float"
	defaultValue := "None"
	ordinal := 0
	return aggregate.State{
		Project:      aggregate.Project{ID: "project-dynamic", Name: "Dynamic project", Revision: 7},
		PythonTarget: aggregate.PythonTarget{Prefix: "import fixture", Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{{
			ID: "callable-dynamic", Name: "Dynamic callable", AuthoredExpression: "fixture.call",
			Parameters: []aggregate.Parameter{
				{ID: "parameter-provider", Name: "value", PassingStyle: aggregate.PassingStylePositionalOnly, TypeAnnotation: &typeAnnotation, Default: &defaultValue, ProviderOrdinal: &ordinal, AuthoredExpression: "1"},
				{ID: "parameter-app", Name: "scale", NameEditable: true, PassingStyle: aggregate.PassingStylePositionalOrKeyword, AuthoredExpression: "2"},
			},
		}},
		ParameterDictionaries: []aggregate.ParameterDictionary{},
		Lists:                 []aggregate.List{},
		TopLevelSectionIDs:    []string{"callable-dynamic"},
		ParameterUIOverrides:  map[string]aggregate.ParameterUI{},
	}
}

func documentMap(t *testing.T, content []byte) map[string]any {
	t.Helper()
	var document map[string]any
	if err := json.Unmarshal(content, &document); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	return document
}

func marshalDocument(t *testing.T, document map[string]any) []byte {
	t.Helper()
	content, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	return content
}

func firstCallable(t *testing.T, document map[string]any) map[string]any {
	t.Helper()
	return document["callables"].([]any)[0].(map[string]any)
}

func firstParameter(t *testing.T, document map[string]any) map[string]any {
	t.Helper()
	return firstCallable(t, document)["parameters"].([]any)[0].(map[string]any)
}
