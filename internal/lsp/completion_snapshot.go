package lsp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

type SnapshotCompletionRequest struct {
	ReferencePath string
	LanguageID    string
	Content       string
	Line          int
	Character     int
}

func (s *Service) CompleteSnapshot(
	ctx context.Context,
	request SnapshotCompletionRequest,
) (CompletionResult, error) {
	if s == nil || s.session == nil {
		return CompletionResult{}, ErrSessionClosed
	}

	referencePath, err := filepath.Abs(strings.TrimSpace(request.ReferencePath))
	if err != nil {
		return CompletionResult{}, fmt.Errorf("lsp: resolve completion reference path: %w", err)
	}
	if strings.TrimSpace(referencePath) == "" {
		return CompletionResult{}, fmt.Errorf("lsp: completion reference path is required")
	}

	tempPath, err := snapshotCompletionPath(referencePath)
	if err != nil {
		return CompletionResult{}, err
	}
	if err := statefs.AtomicWriteFile(tempPath, []byte(request.Content), 0o644); err != nil {
		return CompletionResult{}, fmt.Errorf("lsp: write completion snapshot %q: %w", tempPath, err)
	}

	opened := false
	defer func() {
		if opened {
			_ = s.session.CloseDocument(tempPath)
		}
		_ = os.Remove(tempPath)
	}()

	if err := s.session.OpenDocument(ctx, tempPath, request.LanguageID, request.Content, nil); err != nil {
		return CompletionResult{}, err
	}
	opened = true

	result, err := s.session.Completion(ctx, tempPath, request.Line, request.Character)
	return result, err
}

func snapshotCompletionPath(referencePath string) (string, error) {
	base := filepath.Base(referencePath)
	extension := filepath.Ext(base)
	baseName := strings.TrimSuffix(base, extension)
	if strings.TrimSpace(baseName) == "" {
		baseName = "snapshot"
	}
	suffix, err := randomHex32()
	if err != nil {
		return "", fmt.Errorf("lsp: completion snapshot suffix: %w", err)
	}
	fileName := baseName + "__" + suffix + extension
	return filepath.Join(filepath.Dir(referencePath), fileName), nil
}

func randomHex32() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}
