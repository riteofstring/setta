package app

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/lsp"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

type codeUpdateService struct {
	projectState         *projectstate.Runtime
	lspSync              *lsp.ProjectSynchronizer
	callableSignatures   projectstate.CallableSignatureResolver
	workspaceRoot        string
	watchCodeWarnings    *watchCodeWarningTracker
	frontendWebsocketHub *realtime.WebsocketHub
}

type codeUpdateServiceOptions struct {
	ProjectState       *projectstate.Runtime
	LSPSync            *lsp.ProjectSynchronizer
	CallableSignatures projectstate.CallableSignatureResolver
	WorkspaceRoot      string
	WatchCodeWarnings  *watchCodeWarningTracker
	WebsocketHub       *realtime.WebsocketHub
}

func newCodeUpdateService(options codeUpdateServiceOptions) (*codeUpdateService, error) {
	if options.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return &codeUpdateService{
		projectState:         options.ProjectState,
		lspSync:              options.LSPSync,
		callableSignatures:   options.CallableSignatures,
		workspaceRoot:        strings.TrimSpace(options.WorkspaceRoot),
		watchCodeWarnings:    options.WatchCodeWarnings,
		frontendWebsocketHub: options.WebsocketHub,
	}, nil
}

func (s *codeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}

	signatureObserver := newWatchCodeSignatureObserver(s.callableSignatures)
	snapshot, err := s.projectState.MutateAndSave(ctx, func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.SetCode(projectID, sectionID, code); err != nil {
			return document, err
		}

		boundSection, ok, err := document.ResolveWatchCodeBoundSection(projectID, sectionID, s.workspaceRoot)
		if err != nil || !ok {
			return document, err
		}

		if s.lspSync != nil {
			if err := s.lspSync.SyncWatchCodeBoundSection(ctx, boundSection); err != nil {
				return document, err
			}
		}
		if _, err := document.ApplyWatchCodeBoundSectionUpdate(
			ctx,
			projectID,
			sectionID,
			s.workspaceRoot,
			signatureObserver,
		); err != nil {
			return document, err
		}
		return document, nil
	})
	if err != nil {
		return err
	}

	if s.watchCodeWarnings == nil || s.frontendWebsocketHub == nil {
		return nil
	}
	for _, message := range s.watchCodeWarnings.ConsumeNotifications(
		snapshot.Document,
		projectID,
		signatureObserver.Attempts(),
	) {
		if _, err := s.frontendWebsocketHub.BroadcastJSON(
			ctx,
			message,
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
	}
	return nil
}
