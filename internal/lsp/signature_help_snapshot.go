package lsp

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

type SnapshotSignatureHelpRequest struct {
	ReferencePath string
	LanguageID    string
	Content       string
	Line          int
	Character     int
}

func (s *Service) SignatureHelpSnapshot(
	ctx context.Context,
	request SnapshotSignatureHelpRequest,
) (SignatureHelpResult, error) {
	if s == nil || s.session == nil {
		return SignatureHelpResult{}, ErrSessionClosed
	}

	referencePath, err := filepath.Abs(strings.TrimSpace(request.ReferencePath))
	if err != nil {
		return SignatureHelpResult{}, fmt.Errorf("lsp: resolve signature help reference path: %w", err)
	}
	if strings.TrimSpace(referencePath) == "" {
		return SignatureHelpResult{}, fmt.Errorf("lsp: signature help reference path is required")
	}

	tempPath, err := snapshotCompletionPath(referencePath)
	if err != nil {
		return SignatureHelpResult{}, err
	}
	if err := statefs.AtomicWriteFile(tempPath, []byte(request.Content), 0o644); err != nil {
		return SignatureHelpResult{}, fmt.Errorf("lsp: write signature help snapshot %q: %w", tempPath, err)
	}

	opened := false
	defer func() {
		if opened {
			_ = s.session.CloseDocument(tempPath)
		}
		_ = os.Remove(tempPath)
	}()

	if err := s.session.OpenDocument(ctx, tempPath, request.LanguageID, request.Content, nil); err != nil {
		return SignatureHelpResult{}, err
	}
	opened = true

	return s.session.SignatureHelp(ctx, tempPath, request.Line, request.Character)
}
