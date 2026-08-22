package coordinator

import (
	"errors"
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
