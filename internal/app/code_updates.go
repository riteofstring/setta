package app

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"setta/internal/boundcode"
	"setta/internal/codeformat"
	"setta/internal/lsp"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

type boundSectionSynchronizer interface {
	SyncWatchCodeBoundSection(context.Context, projectstate.WatchCodeBoundSection) error
}

type codeUpdateService struct {
	projectState         *projectstate.Runtime
	lspSync              boundSectionSynchronizer
	callableSignatures   projectstate.CallableSignatureResolver
	workspaceRoot        string
	watchCodeWarnings    *watchCodeWarningTracker
	frontendWebsocketHub *realtime.WebsocketHub
}

type codeUpdateServiceOptions struct {
	ProjectState       *projectstate.Runtime
	LSPSync            boundSectionSynchronizer
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
	snapshot, err := s.projectState.MutateAndSaveReconcilePythonGeneratedSections(
		ctx,
		[]string{projectID},
		func(document projectstate.Document) (projectstate.Document, error) {
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
		},
	)
	if err != nil {
		return err
	}

	return s.broadcastWatchCodeWarnings(ctx, snapshot.Document, []string{projectID}, signatureObserver.Attempts())
}

func (s *codeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}

	target, err := s.projectState.Snapshot().Document.ResolveFormatCodeTarget(projectID, sectionID)
	if err != nil {
		return err
	}

	switch target.Kind {
	case projectstate.FormatCodeTargetKindCode:
		if target.ReadOnly {
			return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, strings.TrimSpace(sectionID))
		}

		formattedCode, err := codeformat.FormatPython(ctx, target.Code, false)
		if err != nil {
			return projectstate.NewFormatCodeError(err.Error())
		}
		return s.SetCode(ctx, projectID, sectionID, formattedCode)
	case projectstate.FormatCodeTargetKindGeneratedPython:
		formattedPrefix, err := codeformat.FormatPython(ctx, target.GenCodePrefix, false)
		if err != nil {
			return projectstate.NewFormatCodeError("Gen code prefix: " + err.Error())
		}
		formattedSuffix, err := codeformat.FormatPython(ctx, target.GenCodeSuffix, false)
		if err != nil {
			return projectstate.NewFormatCodeError("Gen code suffix: " + err.Error())
		}
		_, err = s.projectState.SetGenCodePrefixAndSuffix(ctx, projectID, formattedPrefix, formattedSuffix)
		return err
	default:
		return projectstate.NewFormatCodeError("Format code only supports Python code sections.")
	}
}

func (s *codeUpdateService) ReloadBoundCodeFile(ctx context.Context, raw string, bindings []boundcode.Binding) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}

	orderedBindings := normalizeBoundCodeBindings(bindings)
	if len(orderedBindings) == 0 {
		return nil
	}

	signatureObserver := newWatchCodeSignatureObserver(s.callableSignatures)
	projectIDs := make([]string, 0, len(orderedBindings))
	for _, binding := range orderedBindings {
		projectIDs = append(projectIDs, binding.ProjectID)
	}
	snapshot, err := s.projectState.MutateAndSaveReconcilePythonGeneratedSections(
		ctx,
		projectIDs,
		func(document projectstate.Document) (projectstate.Document, error) {
			for _, binding := range orderedBindings {
				project, ok := document.Projects[binding.ProjectID]
				if !ok {
					continue
				}

				if _, err := project.SetBoundCodeSectionContent(binding.SectionID, raw); err != nil {
					return document, err
				}

				boundSection, ok, err := project.ResolveWatchCodeBoundSection(binding.SectionID, s.workspaceRoot)
				if err != nil {
					return document, err
				}
				document.Projects[project.ID] = project
				if !ok {
					continue
				}

				if s.lspSync != nil {
					if err := s.lspSync.SyncWatchCodeBoundSection(ctx, boundSection); err != nil {
						return document, err
					}
				}
				if _, err := project.ApplyWatchCodeBoundSectionUpdate(
					ctx,
					binding.SectionID,
					s.workspaceRoot,
					signatureObserver,
				); err != nil {
					return document, err
				}
				document.Projects[project.ID] = project
			}
			return document, nil
		},
	)
	if err != nil {
		return err
	}

	return s.broadcastWatchCodeWarnings(ctx, snapshot.Document, projectIDs, signatureObserver.Attempts())
}

func (s *codeUpdateService) broadcastWatchCodeWarnings(
	ctx context.Context,
	document projectstate.Document,
	projectIDs []string,
	attempts map[string]projectstate.SignatureHelpStatus,
) error {
	if s.watchCodeWarnings == nil || s.frontendWebsocketHub == nil {
		return nil
	}

	seenProjectIDs := map[string]struct{}{}
	orderedProjectIDs := make([]string, 0, len(projectIDs))
	for _, projectID := range projectIDs {
		trimmedProjectID := strings.TrimSpace(projectID)
		if trimmedProjectID == "" {
			continue
		}
		if _, exists := seenProjectIDs[trimmedProjectID]; exists {
			continue
		}
		seenProjectIDs[trimmedProjectID] = struct{}{}
		orderedProjectIDs = append(orderedProjectIDs, trimmedProjectID)
	}
	sort.Strings(orderedProjectIDs)

	for _, projectID := range orderedProjectIDs {
		for _, message := range s.watchCodeWarnings.ConsumeNotifications(document, projectID, attempts) {
			if _, err := s.frontendWebsocketHub.BroadcastJSON(
				ctx,
				message,
				realtime.Selection{Type: realtime.ConnectionTypeFrontend},
			); err != nil {
				return err
			}
		}
	}
	return nil
}

func normalizeBoundCodeBindings(bindings []boundcode.Binding) []boundcode.Binding {
	normalized := make([]boundcode.Binding, 0, len(bindings))
	seen := map[boundcode.Binding]struct{}{}
	for _, binding := range bindings {
		normalizedBinding := boundcode.Binding{
			ProjectID: strings.TrimSpace(binding.ProjectID),
			SectionID: strings.TrimSpace(binding.SectionID),
		}
		if normalizedBinding.ProjectID == "" || normalizedBinding.SectionID == "" {
			continue
		}
		if _, exists := seen[normalizedBinding]; exists {
			continue
		}
		seen[normalizedBinding] = struct{}{}
		normalized = append(normalized, normalizedBinding)
	}
	sort.Slice(normalized, func(left int, right int) bool {
		if normalized[left].ProjectID != normalized[right].ProjectID {
			return normalized[left].ProjectID < normalized[right].ProjectID
		}
		return normalized[left].SectionID < normalized[right].SectionID
	})
	return normalized
}

var _ boundSectionSynchronizer = (*lsp.ProjectSynchronizer)(nil)
