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

// CallableCompletionRequest is the immutable canonical context the provider
// needs to complete one uncommitted callable draft.
type CallableCompletionRequest struct {
	ProjectID          string
	SectionID          string
	CanonicalCode      string
	AuthoredExpression string
	CursorOffsetUTF16  int
}

// CallableCompletionItem is the narrow normalized completion result consumed
// by the private project query.
type CallableCompletionItem struct {
	Label      string
	InsertText string
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
) ([]CallableCompletionItem, error) {
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

// ByteOffsetForUTF16Offset converts a JavaScript string index to a Go byte
// offset. It rejects offsets outside the value and the impossible midpoint of
// a surrogate pair so the caller can safely construct an LSP position.
func ByteOffsetForUTF16Offset(value string, offset int) (int, error) {
	if offset < 0 || !utf8.ValidString(value) {
		return 0, ErrCallableCompletionInvalid
	}

	utf16Offset := 0
	for byteOffset := 0; byteOffset < len(value); {
		if utf16Offset == offset {
			return byteOffset, nil
		}
		character, width := utf8.DecodeRuneInString(value[byteOffset:])
		characterWidth := utf16.RuneLen(character)
		if utf16Offset+characterWidth > offset {
			return 0, fmt.Errorf("%w: cursor offset %d is inside a surrogate pair", ErrCallableCompletionInvalid, offset)
		}
		utf16Offset += characterWidth
		byteOffset += width
	}
	if utf16Offset == offset {
		return len(value), nil
	}
	return 0, fmt.Errorf("%w: cursor offset %d exceeds draft length", ErrCallableCompletionInvalid, offset)
}
