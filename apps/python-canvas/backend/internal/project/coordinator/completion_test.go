package coordinator

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestValidatePythonTargetCompletionInputRejectsProtectedBodyAndItsEdges(t *testing.T) {
	const code = "prefix\nbody\nsuffix"
	const bodyStart = len("prefix\n")
	const bodyEnd = bodyStart + len("body")

	for _, cursorOffsetUTF16 := range []int{bodyStart, bodyStart + 1, bodyEnd} {
		_, err := validatePythonTargetCompletionInput(
			code,
			UTF16Range{Start: bodyStart, End: bodyEnd},
			cursorOffsetUTF16,
		)
		if !errors.Is(err, ErrCompletionInvalid) {
			t.Fatalf("cursor %d error = %v, want protected-body validation failure", cursorOffsetUTF16, err)
		}
	}

	for _, cursorOffsetUTF16 := range []int{0, bodyStart - 1, bodyEnd + 1, len(code)} {
		input, err := validatePythonTargetCompletionInput(
			code,
			UTF16Range{Start: bodyStart, End: bodyEnd},
			cursorOffsetUTF16,
		)
		if err != nil {
			t.Fatalf("outer cursor %d error = %v", cursorOffsetUTF16, err)
		}
		if input.cursorOffsetByte != cursorOffsetUTF16 {
			t.Fatalf("outer cursor %d byte offset = %d", cursorOffsetUTF16, input.cursorOffsetByte)
		}
	}
}

func TestCompletionProviderForRequiresReadyProviderState(t *testing.T) {
	_, err := completionProviderFor(Snapshot{ProviderStatus: ProviderStatus{
		Provider: "basedpyright", Availability: ProviderAvailabilityAvailable, State: ProviderLifecyclePending,
	}}, readyProvider())
	if !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("completionProviderFor() error = %v, want provider-unavailable failure", err)
	}
}

func TestCoordinatorRejectsDuplicateGeneratedBodyCompletionSpoof(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	provider := readyProvider()
	coordinator, err := Open(context.Background(), Options{
		ProjectPath:  path,
		Create:       true,
		IDGenerator:  sequenceIDs("project-completion"),
		Materializer: newMaterialization(t, path),
		Provider:     provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()

	snapshot := coordinator.Snapshot()
	outerPrefix := "# copied renderer body\n"
	code := outerPrefix + snapshot.Rendered.Body + "\n\n" + snapshot.Rendered.Code
	outerBodyStart := len(outerPrefix)
	actualBodyStart := len(outerPrefix) + len(snapshot.Rendered.Body) + 2 +
		snapshot.Rendered.GeneratedBodyRange.Start

	_, err = coordinator.CompletePythonTarget(
		context.Background(),
		snapshot.State.Project.ID,
		code,
		UTF16Range{Start: outerBodyStart, End: outerBodyStart + len(snapshot.Rendered.Body)},
		actualBodyStart+1,
	)
	if !errors.Is(err, ErrCompletionInvalid) {
		t.Fatalf("CompletePythonTarget() error = %v, want invalid duplicate-body failure", err)
	}
	if len(provider.pythonTargetCompletionRequests) != 0 {
		t.Fatalf("CompletePythonTarget() forwarded protected-body spoof to provider: %#v", provider.pythonTargetCompletionRequests)
	}
}

func TestCoordinatorCompletesUniquelyMappedOuterPythonTargetRegions(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "project.json")
	provider := readyProvider()
	provider.pythonTargetCompletionItems = []CompletionItem{{Label: "value", InsertText: "value"}}
	coordinator, err := Open(context.Background(), Options{
		ProjectPath:  path,
		Create:       true,
		IDGenerator:  sequenceIDs("project-completion"),
		Materializer: newMaterialization(t, path),
		Provider:     provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()

	snapshot := coordinator.Snapshot()
	code := "prefix draft\n\n" + snapshot.Rendered.Body + "\n\nsuffix draft"
	bodyStart := len("prefix draft\n\n")
	bodyEnd := bodyStart + len(snapshot.Rendered.Body)
	for _, cursor := range []int{0, len(code)} {
		items, completionErr := coordinator.CompletePythonTarget(
			context.Background(),
			snapshot.State.Project.ID,
			code,
			UTF16Range{Start: bodyStart, End: bodyEnd},
			cursor,
		)
		if completionErr != nil {
			t.Fatalf("CompletePythonTarget(cursor %d) error = %v", cursor, completionErr)
		}
		if len(items) != 1 || items[0].Label != "value" {
			t.Fatalf("CompletePythonTarget(cursor %d) items = %#v", cursor, items)
		}
	}
	if len(provider.pythonTargetCompletionRequests) != 2 {
		t.Fatalf("target completion requests = %#v, want prefix and suffix requests", provider.pythonTargetCompletionRequests)
	}
}
