package app

import (
	"context"
	"fmt"
	"log/slog"
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

type projectTypeCheckingSynchronizer interface {
	TypeCheckProject(context.Context, projectstate.Document, string) error
}

type codeUpdateService struct {
	projectState          *projectstate.Runtime
	lspSync               boundSectionSynchronizer
	callableSignatures    projectstate.CallableSignatureResolver
	workspaceRoot         string
	watchCodeCapabilities *watchCodeCapabilityState
	watchCodeWarnings     *watchCodeWarningTracker
	frontendWebsocketHub  *realtime.WebsocketHub
	logger                *slog.Logger
}

type codeUpdateServiceOptions struct {
	ProjectState          *projectstate.Runtime
	LSPSync               boundSectionSynchronizer
	CallableSignatures    projectstate.CallableSignatureResolver
	WorkspaceRoot         string
	WatchCodeCapabilities *watchCodeCapabilityState
	WatchCodeWarnings     *watchCodeWarningTracker
	WebsocketHub          *realtime.WebsocketHub
	Logger                *slog.Logger
}

func newCodeUpdateService(options codeUpdateServiceOptions) (*codeUpdateService, error) {
	if options.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return &codeUpdateService{
		projectState:          options.ProjectState,
		lspSync:               options.LSPSync,
		callableSignatures:    options.CallableSignatures,
		workspaceRoot:         strings.TrimSpace(options.WorkspaceRoot),
		watchCodeCapabilities: options.WatchCodeCapabilities,
		watchCodeWarnings:     options.WatchCodeWarnings,
		frontendWebsocketHub:  options.WebsocketHub,
		logger:                options.Logger,
	}, nil
}

func (s *codeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s == nil {
		return projectstate.ErrRuntimeClosed
	}

	signatureObserver := newWatchCodeSignatureObserver(s.callableSignatures)
	snapshot, needsProjectTypeCheck, err := s.setCodeSnapshot(
		ctx,
		projectID,
		sectionID,
		code,
		signatureObserver,
	)
	if err != nil {
		return err
	}
	return s.finishCodeUpdate(
		ctx,
		snapshot,
		projectID,
		needsProjectTypeCheck,
		signatureObserver.Attempts(),
	)
}

func (s *codeUpdateService) setCodeSnapshot(
	ctx context.Context,
	projectID string,
	sectionID string,
	code string,
	signatureObserver *watchCodeSignatureObserver,
) (projectstate.Snapshot, bool, error) {
	needsProjectTypeCheck := false
	snapshot, err := s.projectState.MutateAndSaveReconcilePythonGeneratedSections(
		ctx,
		[]string{projectID},
		func(document projectstate.Document) (projectstate.Document, error) {
			updatedDocument, updatedNeedsTypeCheck, err := s.applySetCodeUpdate(
				ctx,
				document,
				projectID,
				sectionID,
				code,
				signatureObserver,
			)
			if err != nil {
				return document, err
			}
			needsProjectTypeCheck = updatedNeedsTypeCheck
			return updatedDocument, nil
		},
	)
	if err != nil {
		return projectstate.Snapshot{}, false, err
	}
	return snapshot, needsProjectTypeCheck, nil
}

func (s *codeUpdateService) applySetCodeUpdate(
	ctx context.Context,
	document projectstate.Document,
	projectID string,
	sectionID string,
	code string,
	signatureObserver *watchCodeSignatureObserver,
) (projectstate.Document, bool, error) {
	if err := document.SetCode(projectID, sectionID, code); err != nil {
		return document, false, err
	}
	if !s.watchCodeProviderActive() {
		return document, false, nil
	}

	boundSection, ok, err := document.ResolveWatchCodeBoundSection(projectID, sectionID, s.workspaceRoot)
	if err != nil || !ok {
		return document, false, err
	}
	if err := s.syncBoundCodeSection(ctx, boundSection); err != nil {
		return document, false, err
	}
	if _, err := document.ApplyWatchCodeBoundSectionUpdate(
		ctx,
		projectID,
		sectionID,
		s.workspaceRoot,
		signatureObserver,
	); err != nil {
		return document, false, err
	}
	return document, true, nil
}

func (s *codeUpdateService) finishCodeUpdate(
	ctx context.Context,
	snapshot projectstate.Snapshot,
	projectID string,
	needsProjectTypeCheck bool,
	attempts map[string]projectstate.SignatureHelpStatus,
) error {
	if needsProjectTypeCheck {
		if err := s.typeCheckProjects(ctx, snapshot.Document, []string{projectID}); err != nil {
			return err
		}
	}
	if err := s.broadcastProjectStateUpdates(ctx, snapshot, []string{projectID}); err != nil {
		return err
	}
	return s.broadcastWatchCodeWarnings(ctx, snapshot.Document, []string{projectID}, attempts)
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
	projectIDs := boundCodeBindingProjectIDs(orderedBindings)
	snapshot, typeCheckProjectIDs, err := s.reloadBoundCodeBindings(
		ctx,
		raw,
		projectIDs,
		orderedBindings,
		signatureObserver,
	)
	if err != nil {
		return err
	}
	if err := s.typeCheckProjects(ctx, snapshot.Document, typeCheckProjectIDs); err != nil {
		return err
	}
	if err := s.broadcastProjectStateUpdates(ctx, snapshot, projectIDs); err != nil {
		return err
	}

	return s.broadcastWatchCodeWarnings(ctx, snapshot.Document, projectIDs, signatureObserver.Attempts())
}

func (s *codeUpdateService) reloadBoundCodeBindings(
	ctx context.Context,
	raw string,
	projectIDs []string,
	orderedBindings []boundcode.Binding,
	signatureObserver *watchCodeSignatureObserver,
) (projectstate.Snapshot, []string, error) {
	typeCheckProjectIDs := map[string]struct{}{}
	snapshot, err := s.projectState.MutateAndSaveReconcilePythonGeneratedSections(
		ctx,
		projectIDs,
		func(document projectstate.Document) (projectstate.Document, error) {
			for _, binding := range orderedBindings {
				updatedDocument, err := s.reloadBoundCodeBinding(
					ctx,
					document,
					binding,
					raw,
					signatureObserver,
					typeCheckProjectIDs,
				)
				if err != nil {
					return document, err
				}
				document = updatedDocument
			}
			return document, nil
		},
	)
	if err != nil {
		return projectstate.Snapshot{}, nil, err
	}
	return snapshot, mapKeysSorted(typeCheckProjectIDs), nil
}

func (s *codeUpdateService) reloadBoundCodeBinding(
	ctx context.Context,
	document projectstate.Document,
	binding boundcode.Binding,
	raw string,
	signatureObserver *watchCodeSignatureObserver,
	typeCheckProjectIDs map[string]struct{},
) (projectstate.Document, error) {
	project, ok := document.Projects[binding.ProjectID]
	if !ok {
		return document, nil
	}

	updatedProject, needsTypeCheck, err := s.reloadBoundCodeProject(
		ctx,
		project,
		binding,
		raw,
		signatureObserver,
	)
	if err != nil {
		return document, err
	}
	document.Projects[updatedProject.ID] = updatedProject
	if needsTypeCheck {
		typeCheckProjectIDs[updatedProject.ID] = struct{}{}
	}
	return document, nil
}

func (s *codeUpdateService) reloadBoundCodeProject(
	ctx context.Context,
	project projectstate.Project,
	binding boundcode.Binding,
	raw string,
	signatureObserver *watchCodeSignatureObserver,
) (projectstate.Project, bool, error) {
	if _, err := project.SetBoundCodeSectionContent(binding.SectionID, raw); err != nil {
		return project, false, err
	}
	if !s.watchCodeProviderActive() {
		return project, false, nil
	}

	boundSection, ok, err := project.ResolveWatchCodeBoundSection(binding.SectionID, s.workspaceRoot)
	if err != nil {
		return project, false, err
	}
	if !ok {
		return project, false, nil
	}
	if err := s.syncBoundCodeSection(ctx, boundSection); err != nil {
		return project, false, err
	}
	if _, err := project.ApplyWatchCodeBoundSectionUpdate(
		ctx,
		binding.SectionID,
		s.workspaceRoot,
		signatureObserver,
	); err != nil {
		return project, false, err
	}
	return project, true, nil
}

func (s *codeUpdateService) watchCodeProviderActive() bool {
	if s == nil || s.watchCodeCapabilities == nil {
		return false
	}
	return s.watchCodeCapabilities.ProviderActive()
}

func (s *codeUpdateService) syncBoundCodeSection(ctx context.Context, boundSection projectstate.WatchCodeBoundSection) error {
	if s == nil || s.lspSync == nil {
		return nil
	}
	return s.lspSync.SyncWatchCodeBoundSection(ctx, boundSection)
}

func (s *codeUpdateService) typeCheckProjects(
	ctx context.Context,
	document projectstate.Document,
	projectIDs []string,
) error {
	if s == nil {
		return nil
	}
	typeChecker, ok := s.lspSync.(projectTypeCheckingSynchronizer)
	if !ok {
		if s.logger != nil && len(projectIDs) > 0 {
			s.logger.Debug(
				"watch code project typecheck skipped",
				slog.String("trace_event", "watch_code_project_typecheck_skipped"),
				slog.Any("project_ids", normalizedProjectIDsForTypeCheck(projectIDs)),
				slog.String("reason", "synchronizer_does_not_support_typecheck"),
			)
		}
		return nil
	}
	normalizedProjectIDs := normalizedProjectIDsForTypeCheck(projectIDs)
	if s.logger != nil && len(normalizedProjectIDs) > 0 {
		s.logger.Debug(
			"watch code project typecheck requested",
			slog.String("trace_event", "watch_code_project_typecheck_requested"),
			slog.Any("project_ids", normalizedProjectIDs),
		)
	}
	for _, projectID := range normalizedProjectIDs {
		if err := typeChecker.TypeCheckProject(ctx, document, projectID); err != nil {
			return err
		}
	}
	if s.logger != nil && len(normalizedProjectIDs) > 0 {
		s.logger.Debug(
			"watch code project typecheck completed",
			slog.String("trace_event", "watch_code_project_typecheck_completed"),
			slog.Any("project_ids", normalizedProjectIDs),
		)
	}
	return nil
}

func normalizedProjectIDsForTypeCheck(projectIDs []string) []string {
	normalized := make([]string, 0, len(projectIDs))
	seen := map[string]struct{}{}
	for _, projectID := range projectIDs {
		trimmedProjectID := strings.TrimSpace(projectID)
		if trimmedProjectID == "" {
			continue
		}
		if _, ok := seen[trimmedProjectID]; ok {
			continue
		}
		seen[trimmedProjectID] = struct{}{}
		normalized = append(normalized, trimmedProjectID)
	}
	sort.Strings(normalized)
	return normalized
}

func mapKeysSorted(input map[string]struct{}) []string {
	if len(input) == 0 {
		return nil
	}
	keys := make([]string, 0, len(input))
	for key := range input {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func boundCodeBindingProjectIDs(bindings []boundcode.Binding) []string {
	projectIDs := make([]string, 0, len(bindings))
	for _, binding := range bindings {
		projectIDs = append(projectIDs, binding.ProjectID)
	}
	return projectIDs
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

func (s *codeUpdateService) broadcastProjectStateUpdates(
	ctx context.Context,
	snapshot projectstate.Snapshot,
	projectIDs []string,
) error {
	if s == nil || s.frontendWebsocketHub == nil || s.projectState == nil {
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
		if err := broadcastFrontendProjectStateUpdate(
			ctx,
			s.projectState,
			s.frontendWebsocketHub,
			snapshot,
			projectID,
		); err != nil {
			return err
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
