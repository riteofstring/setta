package project

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

var ErrCallableCompletionInvalid = errors.New("project: callable completion is invalid")
var ErrPythonTargetCompletionInvalid = errors.New("project: Python target completion is invalid")

// CallableCompletionRequest is the immutable canonical context the provider
// needs to complete one uncommitted callable draft.
type CallableCompletionRequest struct {
	ProjectID          string
	SectionID          string
	CanonicalCode      string
	AuthoredExpression string
	CursorOffsetUTF16  int
}

// CompletionItem is the narrow normalized completion result shared by the private project
// queries. Transport turns it into the one V1 completion item shape.
type CompletionItem struct {
	Label      string
	InsertText string
}

type PythonTargetCompletionRegion string

const (
	PythonTargetCompletionPrefix PythonTargetCompletionRegion = "prefix"
	PythonTargetCompletionSuffix PythonTargetCompletionRegion = "suffix"
)

// PythonTargetCompletionRequest is a complete temporary Python module plus the byte position the
// provider must complete. It is constructed from renderer boundaries, never by finding text.
type PythonTargetCompletionRequest struct {
	Code             string
	CursorOffsetByte int
}

// CompleteCallable queries the store-owned provider against an uncommitted
// callable draft. It deliberately captures immutable canonical context before
// waiting so a completion cannot mutate or block the project store.
func (store *Store) CompleteCallable(
	ctx context.Context,
	projectID string,
	sectionID string,
	authoredExpression string,
	cursorOffsetUTF16 int,
) ([]CompletionItem, error) {
	if store == nil {
		return nil, ErrStoreClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateCallableCompletionInput(projectID, sectionID, authoredExpression, cursorOffsetUTF16); err != nil {
		return nil, err
	}

	store.mu.Lock()
	if store.closed {
		store.mu.Unlock()
		return nil, ErrStoreClosed
	}
	provider := store.provider
	request := CallableCompletionRequest{
		ProjectID:          initialProjectID,
		SectionID:          store.state.callable.ID,
		CanonicalCode:      store.state.rendered.Code,
		AuthoredExpression: authoredExpression,
		CursorOffsetUTF16:  cursorOffsetUTF16,
	}
	store.mu.Unlock()

	if provider == nil {
		return nil, ErrLSPProviderRequired
	}
	items, err := provider.CompleteCallable(ctx, request)
	if err != nil {
		return nil, fmt.Errorf("complete callable: %w", errors.Join(ErrProviderUnavailable, err))
	}
	return items, nil
}

// CompletePythonTarget asks the store-owned provider about a temporary rendering of the current
// callable state with both authored Python regions from the request. It never materializes that
// candidate, advances revision, or replaces the canonical document.
func (store *Store) CompletePythonTarget(
	ctx context.Context,
	projectID string,
	region PythonTargetCompletionRegion,
	prefix string,
	suffix string,
	cursorOffsetUTF16 int,
) ([]CompletionItem, error) {
	if store == nil {
		return nil, ErrStoreClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	_, activeCursorOffset, err := validatePythonTargetCompletionInput(
		projectID,
		region,
		prefix,
		suffix,
		cursorOffsetUTF16,
	)
	if err != nil {
		return nil, err
	}

	store.mu.Lock()
	if store.closed {
		store.mu.Unlock()
		return nil, ErrStoreClosed
	}
	provider := store.provider
	candidate := cloneState(store.state)
	candidate.target = pythonTargetState{Prefix: prefix, Suffix: suffix}
	if err := renderState(&candidate); err != nil {
		store.mu.Unlock()
		return nil, fmt.Errorf("%w: render candidate: %v", ErrPythonTargetCompletionInvalid, err)
	}
	var cursorBase int
	switch region {
	case PythonTargetCompletionPrefix:
		cursorBase = candidate.rendered.PrefixStart
	case PythonTargetCompletionSuffix:
		cursorBase = candidate.rendered.SuffixStart
	default:
		store.mu.Unlock()
		return nil, ErrPythonTargetCompletionInvalid
	}
	request := PythonTargetCompletionRequest{
		Code:             candidate.rendered.Code,
		CursorOffsetByte: cursorBase + activeCursorOffset,
	}
	store.mu.Unlock()

	if provider == nil {
		return nil, ErrLSPProviderRequired
	}
	items, err := provider.CompletePythonTarget(ctx, request)
	if err != nil {
		return nil, fmt.Errorf("complete Python target: %w", errors.Join(ErrProviderUnavailable, err))
	}
	return items, nil
}

func validateCallableCompletionInput(
	projectID string,
	sectionID string,
	authoredExpression string,
	cursorOffsetUTF16 int,
) error {
	if err := validateProjectAndSection(projectID, sectionID); err != nil {
		return err
	}
	if strings.TrimSpace(authoredExpression) == "" ||
		len(authoredExpression) > maxAuthoredExpressionBytes ||
		strings.ContainsRune(authoredExpression, '\x00') ||
		strings.ContainsAny(authoredExpression, "\r\n") {
		return ErrCallableCompletionInvalid
	}
	if _, err := ByteOffsetForUTF16Offset(authoredExpression, cursorOffsetUTF16); err != nil {
		return err
	}
	return nil
}

func validatePythonTargetCompletionInput(
	projectID string,
	region PythonTargetCompletionRegion,
	prefix string,
	suffix string,
	cursorOffsetUTF16 int,
) (string, int, error) {
	if projectID != initialProjectID {
		return "", 0, fmt.Errorf("%w: %q", ErrProjectNotFound, projectID)
	}
	if err := validatePythonTargetRegion("prefix", prefix); err != nil {
		return "", 0, fmt.Errorf("%w: prefix", ErrPythonTargetCompletionInvalid)
	}
	if err := validatePythonTargetRegion("suffix", suffix); err != nil {
		return "", 0, fmt.Errorf("%w: suffix", ErrPythonTargetCompletionInvalid)
	}
	var activeText string
	switch region {
	case PythonTargetCompletionPrefix:
		activeText = prefix
	case PythonTargetCompletionSuffix:
		activeText = suffix
	default:
		return "", 0, ErrPythonTargetCompletionInvalid
	}
	byteOffset, err := byteOffsetForUTF16Offset(
		activeText,
		cursorOffsetUTF16,
		ErrPythonTargetCompletionInvalid,
	)
	if err != nil {
		return "", 0, err
	}
	return activeText, byteOffset, nil
}

// ByteOffsetForUTF16Offset converts a JavaScript string index to a Go byte
// offset. It rejects offsets outside the value and the impossible midpoint of
// a surrogate pair so the caller can safely construct an LSP position.
func ByteOffsetForUTF16Offset(value string, offset int) (int, error) {
	return byteOffsetForUTF16Offset(value, offset, ErrCallableCompletionInvalid)
}

func byteOffsetForUTF16Offset(value string, offset int, invalid error) (int, error) {
	if offset < 0 || !utf8.ValidString(value) {
		return 0, invalid
	}

	utf16Offset := 0
	for byteOffset := 0; byteOffset < len(value); {
		if utf16Offset == offset {
			return byteOffset, nil
		}
		character, width := utf8.DecodeRuneInString(value[byteOffset:])
		characterWidth := utf16.RuneLen(character)
		if utf16Offset+characterWidth > offset {
			return 0, fmt.Errorf("%w: cursor offset %d is inside a surrogate pair", invalid, offset)
		}
		utf16Offset += characterWidth
		byteOffset += width
	}
	if utf16Offset == offset {
		return len(value), nil
	}
	return 0, fmt.Errorf("%w: cursor offset %d exceeds value length", invalid, offset)
}
