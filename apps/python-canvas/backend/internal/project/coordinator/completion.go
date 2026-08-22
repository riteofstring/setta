package coordinator

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

// CompleteCallable queries the provider with one uncommitted draft without
// changing the durable aggregate or materialized canonical document.
func (coordinator *Coordinator) CompleteCallable(
	ctx context.Context,
	projectID string,
	callableID string,
	authoredExpression string,
	cursorOffsetUTF16 int,
) ([]CompletionItem, error) {
	if coordinator == nil {
		return nil, ErrCoordinatorClosed
	}
	var err error
	ctx, err = completionContext(ctx)
	if err != nil {
		return nil, err
	}
	if err := validateCallableCompletionInput(authoredExpression, cursorOffsetUTF16); err != nil {
		return nil, err
	}

	snapshot, provider, err := coordinator.completionState(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if !stateHasCallable(snapshot.State, callableID) {
		return nil, fmt.Errorf("%w: %q", aggregate.ErrCallableNotFound, callableID)
	}
	completionProvider, err := completionProviderFor(snapshot, provider)
	if err != nil {
		return nil, err
	}
	items, err := completionProvider.CompleteCallable(ctx, CallableCompletionRequest{
		ProjectID:          projectID,
		CallableID:         callableID,
		CanonicalCode:      snapshot.Rendered.Code,
		AuthoredExpression: authoredExpression,
		CursorOffsetUTF16:  cursorOffsetUTF16,
	})
	if err != nil {
		return nil, providerFailure("complete callable", err)
	}
	return validateCompletionItems(items)
}

// CompletePythonTarget validates the frontend-mapped protected body range in
// one complete target draft before offering completion only outside it.
func (coordinator *Coordinator) CompletePythonTarget(
	ctx context.Context,
	projectID string,
	code string,
	protectedBodyRange UTF16Range,
	cursorOffsetUTF16 int,
) ([]CompletionItem, error) {
	if coordinator == nil {
		return nil, ErrCoordinatorClosed
	}
	var err error
	ctx, err = completionContext(ctx)
	if err != nil {
		return nil, err
	}
	input, err := validatePythonTargetCompletionInput(
		code,
		protectedBodyRange,
		cursorOffsetUTF16,
	)
	if err != nil {
		return nil, err
	}

	snapshot, provider, err := coordinator.completionState(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := validateCanonicalPythonTargetBodyMapping(code, input, snapshot.Rendered.Body); err != nil {
		return nil, err
	}
	completionProvider, err := completionProviderFor(snapshot, provider)
	if err != nil {
		return nil, err
	}
	items, err := completionProvider.CompletePythonTarget(ctx, PythonTargetCompletionRequest{
		Code:             code,
		CursorOffsetByte: input.cursorOffsetByte,
	})
	if err != nil {
		return nil, providerFailure("complete Python target", err)
	}
	return validateCompletionItems(items)
}

func completionContext(ctx context.Context) (context.Context, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return ctx, nil
}

func validateCallableCompletionInput(authoredExpression string, cursorOffsetUTF16 int) error {
	if strings.TrimSpace(authoredExpression) == "" {
		return ErrCompletionInvalid
	}
	if strings.ContainsRune(authoredExpression, '\x00') {
		return ErrCompletionInvalid
	}
	if strings.ContainsAny(authoredExpression, "\r\n") {
		return ErrCompletionInvalid
	}
	if _, err := UTF16ByteOffset(authoredExpression, cursorOffsetUTF16); err != nil {
		return fmt.Errorf("%w: callable cursor: %v", ErrCompletionInvalid, err)
	}
	return nil
}

type pythonTargetCompletionInput struct {
	bodyEnd          int
	bodyStart        int
	cursorOffsetByte int
}

func validatePythonTargetCompletionInput(code string, protectedBodyRange UTF16Range, cursorOffsetUTF16 int) (pythonTargetCompletionInput, error) {
	if code == "" {
		return pythonTargetCompletionInput{}, ErrCompletionInvalid
	}
	if strings.ContainsRune(code, '\x00') {
		return pythonTargetCompletionInput{}, ErrCompletionInvalid
	}
	start, err := UTF16ByteOffset(code, protectedBodyRange.Start)
	if err != nil {
		return pythonTargetCompletionInput{}, fmt.Errorf("%w: protected range start: %v", ErrCompletionInvalid, err)
	}
	end, err := UTF16ByteOffset(code, protectedBodyRange.End)
	if err != nil {
		return pythonTargetCompletionInput{}, fmt.Errorf("%w: protected range end", ErrCompletionInvalid)
	}
	if end < start {
		return pythonTargetCompletionInput{}, fmt.Errorf("%w: protected range end", ErrCompletionInvalid)
	}
	cursor, err := UTF16ByteOffset(code, cursorOffsetUTF16)
	if err != nil {
		return pythonTargetCompletionInput{}, fmt.Errorf("%w: target cursor", ErrCompletionInvalid)
	}
	if cursorOffsetUTF16 >= protectedBodyRange.Start && cursorOffsetUTF16 <= protectedBodyRange.End {
		return pythonTargetCompletionInput{}, fmt.Errorf("%w: target cursor", ErrCompletionInvalid)
	}
	return pythonTargetCompletionInput{bodyStart: start, bodyEnd: end, cursorOffsetByte: cursor}, nil
}

// validateCanonicalPythonTargetBodyMapping binds the caller's mapped range to
// exactly one occurrence of the renderer-owned body. The range is a UI
// coordinate claim, never a selector for which matching body is protected.
func validateCanonicalPythonTargetBodyMapping(code string, input pythonTargetCompletionInput, canonicalBody string) error {
	if canonicalBody == "" {
		return fmt.Errorf("%w: canonical renderer body is empty", ErrCompletionInvalid)
	}
	canonicalStart := strings.Index(code, canonicalBody)
	if canonicalStart < 0 || strings.Contains(code[canonicalStart+1:], canonicalBody) {
		return fmt.Errorf("%w: canonical renderer body is not uniquely mapped", ErrCompletionInvalid)
	}
	canonicalEnd := canonicalStart + len(canonicalBody)
	if input.bodyStart != canonicalStart || input.bodyEnd != canonicalEnd {
		return fmt.Errorf("%w: protected body range does not map the canonical renderer body", ErrCompletionInvalid)
	}
	if input.cursorOffsetByte >= canonicalStart && input.cursorOffsetByte <= canonicalEnd {
		return fmt.Errorf("%w: target cursor", ErrCompletionInvalid)
	}
	return nil
}

func (coordinator *Coordinator) completionState(ctx context.Context, projectID string) (Snapshot, Provider, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if err := coordinator.requireOpen(ctx); err != nil {
		return Snapshot{}, nil, err
	}
	snapshot := coordinator.snapshot.Clone()
	if snapshot.State.Project.ID != projectID {
		return Snapshot{}, nil, fmt.Errorf("%w: %q", aggregate.ErrProjectNotFound, projectID)
	}
	return snapshot, coordinator.provider, nil
}

func completionProviderFor(snapshot Snapshot, provider Provider) (CompletionProvider, error) {
	if provider == nil {
		return nil, ErrProviderUnavailable
	}
	if !providerIsReady(snapshot.ProviderStatus) {
		return nil, ErrProviderUnavailable
	}
	completionProvider, ok := provider.(CompletionProvider)
	if !ok {
		return nil, ErrProviderUnavailable
	}
	return completionProvider, nil
}

func stateHasCallable(state aggregate.State, callableID string) bool {
	for _, callable := range state.Callables {
		if callable.ID == callableID {
			return true
		}
	}
	return false
}

func validateCompletionItems(items []CompletionItem) ([]CompletionItem, error) {
	if items == nil {
		return []CompletionItem{}, nil
	}
	result := make([]CompletionItem, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.Label) == "" || strings.TrimSpace(item.InsertText) == "" {
			return nil, fmt.Errorf("%w: malformed completion item", ErrProviderFailed)
		}
		result = append(result, item)
	}
	return result, nil
}

// UTF16ByteOffset converts a JavaScript string offset to a Go byte boundary.
// It rejects a surrogate-pair midpoint so every downstream position is exact.
func UTF16ByteOffset(value string, offset int) (int, error) {
	if offset < 0 || !utf8.ValidString(value) {
		return 0, fmt.Errorf("invalid UTF-16 offset")
	}
	utf16Offset := 0
	for byteOffset := 0; byteOffset < len(value); {
		if utf16Offset == offset {
			return byteOffset, nil
		}
		character, width := utf8.DecodeRuneInString(value[byteOffset:])
		characterWidth := utf16.RuneLen(character)
		if utf16Offset+characterWidth > offset {
			return 0, fmt.Errorf("offset splits a surrogate pair")
		}
		utf16Offset += characterWidth
		byteOffset += width
	}
	if utf16Offset == offset {
		return len(value), nil
	}
	return 0, fmt.Errorf("offset exceeds value length")
}
