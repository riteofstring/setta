package lsp

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/setta/python-canvas/backend/internal/project/coordinator"
)

const completionSnapshotSeparator = "\n\n"

// CompleteCallable completes one uncommitted callable expression in a sibling
// document. The canonical generated document is never opened, changed, or
// written by this read-only query.
func (provider *BasedpyrightProvider) CompleteCallable(
	ctx context.Context,
	request coordinator.CallableCompletionRequest,
) ([]coordinator.CompletionItem, error) {
	snapshotCode, draftStart, err := completionSnapshot(request.CanonicalCode, request.AuthoredExpression)
	if err != nil {
		return nil, err
	}
	draftOffset, err := coordinator.UTF16ByteOffset(request.AuthoredExpression, request.CursorOffsetUTF16)
	if err != nil {
		return nil, fmt.Errorf("lsp: resolve completion cursor: %w", err)
	}
	return provider.completeSnapshot(ctx, snapshotCode, draftStart+draftOffset)
}

// CompletePythonTarget uses the same temporary-document lifecycle as callable completion. Its
// request is already a fully rendered candidate module and a renderer-derived byte boundary.
func (provider *BasedpyrightProvider) CompletePythonTarget(
	ctx context.Context,
	request coordinator.PythonTargetCompletionRequest,
) ([]coordinator.CompletionItem, error) {
	return provider.completeSnapshot(ctx, request.Code, request.CursorOffsetByte)
}

func (provider *BasedpyrightProvider) completeSnapshot(
	ctx context.Context,
	snapshotCode string,
	cursorOffsetByte int,
) ([]coordinator.CompletionItem, error) {
	if provider == nil {
		return nil, ErrProviderClosed
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	if provider.closed {
		return nil, ErrProviderClosed
	}
	if strings.TrimSpace(snapshotCode) == "" {
		return nil, fmt.Errorf("lsp: completion context is empty")
	}
	position, err := positionForByteOffset(snapshotCode, cursorOffsetByte)
	if err != nil {
		return nil, fmt.Errorf("lsp: resolve completion position: %w", err)
	}

	snapshotPath, err := provider.createCompletionSnapshot(snapshotCode)
	if err != nil {
		return nil, err
	}
	defer os.Remove(snapshotPath)

	if err := provider.session.SynchronizeDocument(ctx, snapshotPath, "python", 1, snapshotCode, nil); err != nil {
		return nil, err
	}
	closedDocument := false
	defer func() {
		if !closedDocument {
			_ = provider.session.CloseDocument(snapshotPath)
		}
	}()

	result, err := provider.session.Completion(ctx, snapshotPath, position)
	if err != nil {
		return nil, err
	}
	if err := provider.session.CloseDocument(snapshotPath); err != nil {
		return nil, err
	}
	closedDocument = true
	return normalizeCompletionItems(result)
}

func completionSnapshot(canonicalCode string, authoredExpression string) (string, int, error) {
	if strings.TrimSpace(canonicalCode) == "" {
		return "", 0, fmt.Errorf("lsp: canonical completion context is empty")
	}
	draftStart := len(canonicalCode) + len(completionSnapshotSeparator)
	return canonicalCode + completionSnapshotSeparator + authoredExpression, draftStart, nil
}

func (provider *BasedpyrightProvider) createCompletionSnapshot(code string) (string, error) {
	snapshot, err := os.CreateTemp(provider.workspaceRoot, ".setta-completion-*.py")
	if err != nil {
		return "", fmt.Errorf("lsp: create completion snapshot: %w", err)
	}
	snapshotPath := snapshot.Name()
	defer func() {
		if err != nil {
			_ = os.Remove(snapshotPath)
		}
	}()
	if _, err = snapshot.WriteString(code); err != nil {
		_ = snapshot.Close()
		return "", fmt.Errorf("lsp: write completion snapshot: %w", err)
	}
	if err = snapshot.Close(); err != nil {
		return "", fmt.Errorf("lsp: close completion snapshot: %w", err)
	}
	return snapshotPath, nil
}

func normalizeCompletionItems(result CompletionResult) ([]coordinator.CompletionItem, error) {
	items := make([]coordinator.CompletionItem, 0, len(result.Items))
	for index, item := range result.Items {
		label := strings.TrimSpace(item.Label)
		if label == "" {
			return nil, fmt.Errorf("lsp: completion item %d has an empty label", index)
		}
		insertText := strings.TrimSpace(item.InsertText)
		if insertText == "" {
			insertText = label
		}
		items = append(items, coordinator.CompletionItem{
			Label:      label,
			InsertText: insertText,
		})
	}
	return items, nil
}
