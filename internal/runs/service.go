package runs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/statefs"
	"setta/internal/terminals"
)

var (
	ErrPlannerRequired         = fmt.Errorf("runs: planner is required")
	ErrTerminalServiceRequired = fmt.Errorf("runs: terminal service is required")
	ErrBackendLogsRequired     = fmt.Errorf("runs: backend log service is required")
	ErrBinaryStoreRequired     = fmt.Errorf("runs: binary store is required")
	ErrArtifactsRootRequired   = fmt.Errorf("runs: artifacts root is required")
	ErrDeploymentRunDenied     = fmt.Errorf("runs: deployment policy disallows run and terminal access")
	ErrDeploymentVariantDenied = fmt.Errorf("runs: deployment policy disallows variant changes")
	ErrDeploymentSingleRunOnly = fmt.Errorf("runs: deployment policy allows only one run per session")
)

type ServiceOptions struct {
	Planner           *Planner
	ProjectState      *projectstate.Runtime
	DeploymentRuntime *deployments.Runtime
	Terminals         *terminals.Service
	BackendLogs       *backendlogs.Service
	BinaryStore       *binarypayload.Store
	ListenerProducer  *realtime.ListenerProducer
	ArtifactsRoot     string
	IDGenerator       func() string
}

type RunCodeRequest struct {
	ProjectID                string
	SectionID                string
	TerminalSectionID        string
	RunSnapshotMode          RunSnapshotMode
	DrawSnapshotsBySectionID map[string]binarypayload.ContentRef
	SectionVariantOverrides  map[string]string
	ParamOverrides           map[string]string
	ShareSessionID           string
}

type RunCodeResult struct {
	Plan              Plan
	TerminalSectionID string
	TerminalID        string
	CreatedSession    bool
}

type Service struct {
	planner       *Planner
	projectState  *projectstate.Runtime
	deployment    *deployments.Runtime
	terminals     *terminals.Service
	backendLogs   *backendlogs.Service
	binaryStore   *binarypayload.Store
	listener      *realtime.ListenerProducer
	artifactsRoot string
	idGenerator   func() string
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Planner == nil {
		return nil, ErrPlannerRequired
	}
	if options.ProjectState == nil {
		return nil, ErrProjectRuntimeRequired
	}
	if options.Terminals == nil {
		return nil, ErrTerminalServiceRequired
	}
	if options.BackendLogs == nil {
		return nil, ErrBackendLogsRequired
	}
	if options.BinaryStore == nil {
		return nil, ErrBinaryStoreRequired
	}
	resolvedArtifactsRoot, err := statefs.NormalizePath(options.ArtifactsRoot, "")
	if err != nil {
		return nil, ErrArtifactsRootRequired
	}

	idGenerator := options.IDGenerator
	if idGenerator == nil {
		idGenerator = newRandomID
	}

	return &Service{
		planner:       options.Planner,
		projectState:  options.ProjectState,
		deployment:    options.DeploymentRuntime,
		terminals:     options.Terminals,
		backendLogs:   options.BackendLogs,
		binaryStore:   options.BinaryStore,
		listener:      options.ListenerProducer,
		artifactsRoot: resolvedArtifactsRoot,
		idGenerator:   idGenerator,
	}, nil
}

func (s *Service) RunCode(ctx context.Context, request RunCodeRequest) (RunCodeResult, error) {
	if s == nil {
		return RunCodeResult{}, ErrPlannerRequired
	}

	execution, err := s.resolveExecution(request)
	if err != nil {
		return RunCodeResult{}, err
	}

	startupCommitted := false
	if execution.reservedSingleRun {
		defer func() {
			if startupCommitted {
				return
			}
			_, _ = s.deployment.RollbackReservedSessionRun(request.ShareSessionID)
		}()
	}

	if err := s.applyDrawSnapshots(ctx, execution.projectState, execution.artifactsRoot, request.ProjectID, request.ShareSessionID, request.DrawSnapshotsBySectionID); err != nil {
		return RunCodeResult{}, err
	}

	plan, err := execution.planner.Plan(PlanRequest{
		ProjectID:               request.ProjectID,
		SectionID:               request.SectionID,
		RunSnapshotMode:         execution.runSnapshotMode,
		SectionVariantOverrides: request.SectionVariantOverrides,
		ParamOverrides:          request.ParamOverrides,
	})
	if err != nil {
		return RunCodeResult{}, err
	}

	terminalSectionID, err := s.resolveTerminalSection(ctx, execution.projectState, request.ProjectID, request.ShareSessionID, plan, request.TerminalSectionID)
	if err != nil {
		return RunCodeResult{}, err
	}

	terminalID := terminals.BuildTerminalID(terminalSectionID, request.ShareSessionID)
	createdSession := false
	if _, ok := s.terminals.Session(terminalID); !ok {
		_, opened, err := s.terminals.Open(terminals.OpenOptions{
			ID:             terminalID,
			ProjectID:      request.ProjectID,
			ShareSessionID: request.ShareSessionID,
			AllowInput:     strings.TrimSpace(request.ShareSessionID) == "",
		})
		if err != nil {
			return RunCodeResult{}, err
		}
		createdSession = opened
	}

	command := plan.Command
	if !strings.HasSuffix(command, "\n") {
		command += "\n"
	}
	if err := s.terminals.RunCommand(terminalID, []byte(command)); err != nil {
		return RunCodeResult{}, err
	}
	startupCommitted = true
	if execution.deployment && !execution.reservedSingleRun {
		if _, err := s.deployment.IncrementSessionRunCount(request.ShareSessionID); err != nil {
			return RunCodeResult{}, err
		}
	}
	if err := s.backendLogs.LogAndBroadcast(ctx, backendlogs.LogRequest{
		Message:        "Started command",
		Severity:       backendlogs.SeverityInfo,
		ProjectID:      request.ProjectID,
		ShareSessionID: request.ShareSessionID,
	}); err != nil {
		return RunCodeResult{}, err
	}

	return RunCodeResult{
		Plan:              plan,
		TerminalSectionID: terminalSectionID,
		TerminalID:        terminalID,
		CreatedSession:    createdSession,
	}, nil
}

type runExecution struct {
	planner           *Planner
	projectState      *projectstate.Runtime
	artifactsRoot     string
	runSnapshotMode   RunSnapshotMode
	reservedSingleRun bool
	deployment        bool
}

func (s *Service) resolveExecution(request RunCodeRequest) (runExecution, error) {
	if s.deployment == nil {
		return runExecution{
			planner:         s.planner,
			projectState:    s.projectState,
			artifactsRoot:   s.artifactsRoot,
			runSnapshotMode: request.RunSnapshotMode,
		}, nil
	}

	policy := s.deployment.Policy()
	if !policy.AllowRun {
		return runExecution{}, ErrDeploymentRunDenied
	}
	if len(request.SectionVariantOverrides) > 0 && !policy.AllowVariantChanges {
		return runExecution{}, ErrDeploymentVariantDenied
	}

	reservedSingleRun := false
	if !policy.AllowMultipleRuns {
		reserved, err := s.deployment.TryReserveSessionRun(request.ShareSessionID)
		if err != nil {
			return runExecution{}, err
		}
		if !reserved {
			return runExecution{}, ErrDeploymentSingleRunOnly
		}
		reservedSingleRun = true
	}

	projectState, err := s.deployment.Overlay(request.ShareSessionID)
	if err != nil {
		if reservedSingleRun {
			_, _ = s.deployment.RollbackReservedSessionRun(request.ShareSessionID)
		}
		return runExecution{}, err
	}
	sessionRunRoot, err := s.deployment.Paths().SessionRunRoot(request.ShareSessionID)
	if err != nil {
		if reservedSingleRun {
			_, _ = s.deployment.RollbackReservedSessionRun(request.ShareSessionID)
		}
		return runExecution{}, err
	}
	planner, err := s.planner.withOptions(PlannerOptions{
		ProjectState:           projectState,
		SettaFilesRoot:         s.deployment.Paths().DeploymentRoot,
		RuntimeRoot:            s.deployment.Paths().RuntimeRoot,
		SnapshotRoot:           sessionRunRoot,
		DefaultRunSnapshotMode: RunSnapshotMode(policy.RunSnapshotMode),
	})
	if err != nil {
		if reservedSingleRun {
			_, _ = s.deployment.RollbackReservedSessionRun(request.ShareSessionID)
		}
		return runExecution{}, err
	}

	return runExecution{
		planner:           planner,
		projectState:      projectState,
		artifactsRoot:     s.deployment.Paths().ArtifactsRoot,
		runSnapshotMode:   RunSnapshotMode(policy.RunSnapshotMode),
		reservedSingleRun: reservedSingleRun,
		deployment:        true,
	}, nil
}

func (s *Service) resolveTerminalSection(ctx context.Context, projectState *projectstate.Runtime, projectID string, shareSessionID string, plan Plan, explicitTerminalSectionID string) (string, error) {
	if plan.TargetKind == projectstate.RunTargetKindGeneratedEntry {
		reusableTerminalSectionID, err := s.resolveReusableGeneratedEntryTerminalSection(projectState, projectID, shareSessionID)
		if err != nil {
			return "", err
		}
		if reusableTerminalSectionID != "" {
			return reusableTerminalSectionID, nil
		}

		_, terminalSectionID, err := projectState.CreateTemporaryTerminal(projectID, s.newTerminalSeed())
		if err != nil {
			return "", err
		}
		if _, err := projectState.Save(ctx); err != nil {
			return "", err
		}
		return terminalSectionID, nil
	}

	document := projectState.Snapshot().Document
	validExplicitTerminal, err := document.ValidateAttachedTerminalForVariant(projectID, plan.SectionID, plan.VariantID, explicitTerminalSectionID)
	if err != nil {
		return "", err
	}
	if validExplicitTerminal {
		return strings.TrimSpace(explicitTerminalSectionID), nil
	}

	_, terminalSectionID, err := projectState.EnsureCodeSectionAttachedTerminalForVariant(projectID, plan.SectionID, plan.VariantID, s.newTerminalSeed())
	if err != nil {
		return "", err
	}
	if _, err := projectState.Save(ctx); err != nil {
		return "", err
	}
	return terminalSectionID, nil
}

func (s *Service) resolveReusableGeneratedEntryTerminalSection(projectState *projectstate.Runtime, projectID string, shareSessionID string) (string, error) {
	document := projectState.Snapshot().Document
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return "", err
	}

	for _, sectionID := range project.TopLevelSectionIDs {
		section, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return "", err
		}
		if !impl.IsTerminal() {
			continue
		}

		terminalID := terminals.BuildTerminalID(section.ID, shareSessionID)
		if s.terminals.ReusableSession(terminalID) {
			return section.ID, nil
		}
	}

	return "", nil
}

func (s *Service) newTerminalSeed() projectstate.TerminalSectionSeed {
	id := s.idGenerator()
	return projectstate.TerminalSectionSeed{
		SectionID: "terminal-" + id,
		VariantID: "terminal-variant-" + id,
		ImplID:    "terminal-impl-" + id,
		Name:      "Terminal",
	}
}

func (s *Service) applyDrawSnapshots(ctx context.Context, projectState *projectstate.Runtime, artifactsRoot string, projectID string, shareSessionID string, refsBySectionID map[string]binarypayload.ContentRef) error {
	if len(refsBySectionID) == 0 {
		return nil
	}

	document := projectState.Snapshot().Document
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}

	type drawSnapshotUpdate struct {
		sectionID string
		path      string
		ref       binarypayload.ContentRef
		payload   []byte
	}

	updates := make([]drawSnapshotUpdate, 0, len(refsBySectionID))
	renderedPathsBySectionID := make(map[string]string, len(refsBySectionID))
	for sectionID, ref := range refsBySectionID {
		_, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return err
		}
		if !impl.IsDraw() {
			return fmt.Errorf("%w: %q", projectstate.ErrDrawSectionRequired, sectionID)
		}

		targetPath := strings.TrimSpace(impl.Draw.RenderedImagePath)
		if targetPath == "" {
			targetPath, err = projectstate.BuildDrawSnapshotPath(sectionID, artifactsRoot)
			if err != nil {
				return err
			}
		}

		payload, err := s.binaryStore.ReadBytes(ref.ContentID)
		if err != nil {
			return err
		}
		updates = append(updates, drawSnapshotUpdate{
			sectionID: sectionID,
			path:      targetPath,
			ref:       ref,
			payload:   payload,
		})
		renderedPathsBySectionID[sectionID] = targetPath
	}

	for _, update := range updates {
		if err := statefs.AtomicWriteFile(update.path, update.payload, 0o644); err != nil {
			return fmt.Errorf("write draw snapshot %q: %w", update.sectionID, err)
		}
	}

	if _, err := projectState.SetDrawSectionRenderedImagePaths(projectID, renderedPathsBySectionID); err != nil {
		return err
	}
	if _, err := projectState.Save(ctx); err != nil {
		return err
	}
	if s.listener != nil {
		deltas := make([]realtime.BinarySectionDelta, 0, len(updates))
		for _, update := range updates {
			deltas = append(deltas, realtime.BinarySectionDelta{
				SectionID:     update.sectionID,
				Value:         update.ref,
				BinaryPayload: update.payload,
			})
		}
		if err := s.listener.EmitSectionBinaryDeltas(ctx, realtime.EmitSectionBinaryDeltasParams{
			ProjectID:      projectID,
			ShareSessionID: shareSessionID,
			Deltas:         deltas,
		}); err != nil {
			return err
		}
	}
	for _, update := range updates {
		_ = s.binaryStore.Delete(update.ref.ContentID)
	}
	return nil
}

func newRandomID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Sprintf("runs: generate random id: %v", err))
	}
	return hex.EncodeToString(buffer)
}
