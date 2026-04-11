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
	"setta/internal/settingsstate"
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
	SettingsState     *settingsstate.Runtime
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
	settingsState *settingsstate.Runtime
	deployment    *deployments.Runtime
	terminals     *terminals.Service
	backendLogs   *backendlogs.Service
	binaryStore   *binarypayload.Store
	listener      *realtime.ListenerProducer
	artifactsRoot string
	idGenerator   func() string
}

type runTerminalSession struct {
	sectionID  string
	terminalID string
	created    bool
}

type runStartupGuard struct {
	active   bool
	rollback func()
}

type drawSnapshotUpdate struct {
	sectionID string
	path      string
	ref       binarypayload.ContentRef
	payload   []byte
}

type drawSnapshotBatch struct {
	updates                  []drawSnapshotUpdate
	renderedPathsBySectionID map[string]string
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
		settingsState: options.SettingsState,
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

	startupGuard := s.newRunStartupGuard(request.ShareSessionID, execution.reservedSingleRun)
	defer startupGuard.Rollback()

	if err := s.applyDrawSnapshots(ctx, execution.projectState, execution.artifactsRoot, request.ProjectID, request.ShareSessionID, request.DrawSnapshotsBySectionID); err != nil {
		return RunCodeResult{}, err
	}

	plan, err := execution.plan(request)
	if err != nil {
		return RunCodeResult{}, err
	}

	terminal, err := s.prepareRunTerminal(ctx, execution.projectState, request, plan)
	if err != nil {
		return RunCodeResult{}, err
	}

	if err := s.runPlannedCommand(terminal.terminalID, plan.Command); err != nil {
		return RunCodeResult{}, err
	}
	startupGuard.Commit()
	if err := s.recordRunStart(ctx, execution, request); err != nil {
		return RunCodeResult{}, err
	}

	return RunCodeResult{
		Plan:              plan,
		TerminalSectionID: terminal.sectionID,
		TerminalID:        terminal.terminalID,
		CreatedSession:    terminal.created,
	}, nil
}

type runExecution struct {
	planner                    *Planner
	projectState               *projectstate.Runtime
	artifactsRoot              string
	runSnapshotMode            RunSnapshotMode
	reservedSingleRun          bool
	deployment                 bool
	disallowParamOverrides     bool
	disallowCodeParamOverrides bool
}

func (g *runStartupGuard) Commit() {
	if g == nil {
		return
	}
	g.active = false
}

func (g *runStartupGuard) Rollback() {
	if g == nil || !g.active || g.rollback == nil {
		return
	}
	g.rollback()
	g.active = false
}

func (r runExecution) plan(request RunCodeRequest) (Plan, error) {
	return r.planner.Plan(PlanRequest{
		ProjectID:                  request.ProjectID,
		SectionID:                  request.SectionID,
		RunSnapshotMode:            r.runSnapshotMode,
		SectionVariantOverrides:    request.SectionVariantOverrides,
		ParamOverrides:             request.ParamOverrides,
		DisallowParamOverrides:     r.disallowParamOverrides,
		DisallowCodeParamOverrides: r.disallowCodeParamOverrides,
	})
}

func (s *Service) resolveExecution(request RunCodeRequest) (runExecution, error) {
	if s.deployment == nil {
		return s.baseExecution(request), nil
	}

	policy := s.deployment.Policy()
	if err := validateDeploymentRunRequest(policy, request); err != nil {
		return runExecution{}, err
	}

	reservedSingleRun, err := s.reserveDeploymentRun(policy, request.ShareSessionID)
	if err != nil {
		return runExecution{}, err
	}
	return s.resolveDeploymentExecution(request, policy, reservedSingleRun)
}

func (s *Service) baseExecution(request RunCodeRequest) runExecution {
	return runExecution{
		planner:                    s.planner,
		projectState:               s.projectState,
		artifactsRoot:              s.artifactsRoot,
		runSnapshotMode:            request.RunSnapshotMode,
		disallowParamOverrides:     false,
		disallowCodeParamOverrides: false,
	}
}

func validateDeploymentRunRequest(policy deployments.Policy, request RunCodeRequest) error {
	if !policy.AllowRun {
		return ErrDeploymentRunDenied
	}
	if len(request.SectionVariantOverrides) > 0 && !policy.AllowVariantChanges {
		return ErrDeploymentVariantDenied
	}
	return nil
}

func (s *Service) reserveDeploymentRun(policy deployments.Policy, shareSessionID string) (bool, error) {
	if policy.AllowMultipleRuns {
		return false, nil
	}
	reserved, err := s.deployment.TryReserveSessionRun(shareSessionID)
	if err != nil {
		return false, err
	}
	if !reserved {
		return false, ErrDeploymentSingleRunOnly
	}
	return true, nil
}

func (s *Service) resolveDeploymentExecution(request RunCodeRequest, policy deployments.Policy, reservedSingleRun bool) (execution runExecution, err error) {
	defer func() {
		if err == nil || !reservedSingleRun {
			return
		}
		_, _ = s.deployment.RollbackReservedSessionRun(request.ShareSessionID)
	}()

	projectState, err := s.deployment.Overlay(request.ShareSessionID)
	if err != nil {
		return runExecution{}, err
	}
	planner, err := s.newDeploymentPlanner(projectState, request.ShareSessionID, policy)
	if err != nil {
		return runExecution{}, err
	}

	return runExecution{
		planner:                    planner,
		projectState:               projectState,
		artifactsRoot:              s.deployment.Paths().ArtifactsRoot,
		runSnapshotMode:            RunSnapshotMode(policy.RunSnapshotMode),
		reservedSingleRun:          reservedSingleRun,
		deployment:                 true,
		disallowParamOverrides:     !policy.AllowParamChanges,
		disallowCodeParamOverrides: true,
	}, nil
}

func (s *Service) newDeploymentPlanner(projectState *projectstate.Runtime, shareSessionID string, policy deployments.Policy) (*Planner, error) {
	sessionRunRoot, err := s.deployment.Paths().SessionRunRoot(shareSessionID)
	if err != nil {
		return nil, err
	}
	return s.planner.withOptions(PlannerOptions{
		ProjectState:           projectState,
		SettaFilesRoot:         s.deployment.Paths().DeploymentRoot,
		RuntimeRoot:            s.deployment.Paths().RuntimeRoot,
		SnapshotRoot:           sessionRunRoot,
		DefaultRunSnapshotMode: RunSnapshotMode(policy.RunSnapshotMode),
	})
}

func (s *Service) newRunStartupGuard(shareSessionID string, reservedSingleRun bool) *runStartupGuard {
	if !reservedSingleRun {
		return nil
	}
	return &runStartupGuard{
		active: true,
		rollback: func() {
			_, _ = s.deployment.RollbackReservedSessionRun(shareSessionID)
		},
	}
}

func (s *Service) prepareRunTerminal(ctx context.Context, projectState *projectstate.Runtime, request RunCodeRequest, plan Plan) (runTerminalSession, error) {
	terminalSectionID, err := s.resolveTerminalSection(ctx, projectState, request.ProjectID, request.ShareSessionID, plan, request.TerminalSectionID)
	if err != nil {
		return runTerminalSession{}, err
	}
	terminalID := terminals.BuildTerminalID(terminalSectionID, request.ShareSessionID)
	created, err := s.ensureTerminalSession(terminalID, request.ProjectID, request.ShareSessionID)
	if err != nil {
		return runTerminalSession{}, err
	}
	return runTerminalSession{
		sectionID:  terminalSectionID,
		terminalID: terminalID,
		created:    created,
	}, nil
}

func (s *Service) ensureTerminalSession(terminalID string, projectID string, shareSessionID string) (bool, error) {
	if _, ok := s.terminals.Session(terminalID); ok {
		return false, nil
	}
	_, opened, err := s.terminals.Open(terminals.OpenOptions{
		ID:             terminalID,
		ProjectID:      projectID,
		ShareSessionID: shareSessionID,
		AllowInput:     strings.TrimSpace(shareSessionID) == "",
	})
	if err != nil {
		return false, err
	}
	return opened, nil
}

func (s *Service) runPlannedCommand(terminalID string, command string) error {
	if !strings.HasSuffix(command, "\n") {
		command += "\n"
	}
	return s.terminals.RunCommand(terminalID, []byte(command))
}

func (s *Service) recordRunStart(ctx context.Context, execution runExecution, request RunCodeRequest) error {
	if execution.deployment && !execution.reservedSingleRun {
		if _, err := s.deployment.IncrementSessionRunCount(request.ShareSessionID); err != nil {
			return err
		}
	}
	return s.backendLogs.LogAndBroadcast(ctx, backendlogs.LogRequest{
		Message:        "Started command",
		Severity:       backendlogs.SeverityInfo,
		ProjectID:      request.ProjectID,
		ShareSessionID: request.ShareSessionID,
	})
}

func (s *Service) resolveTerminalSection(ctx context.Context, projectState *projectstate.Runtime, projectID string, shareSessionID string, plan Plan, explicitTerminalSectionID string) (string, error) {
	settings, err := s.structuralMutationSettings()
	if err != nil {
		return "", err
	}

	if plan.TargetKind == projectstate.RunTargetKindGeneratedEntry {
		reusableTerminalSectionID, err := s.resolveReusableGeneratedEntryTerminalSection(projectState, projectID, shareSessionID)
		if err != nil {
			return "", err
		}
		if reusableTerminalSectionID != "" {
			return reusableTerminalSectionID, nil
		}

		_, terminalSectionID, err := projectState.CreateTemporaryTerminalWithSettings(projectID, s.newTerminalSeed(), settings)
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

	_, terminalSectionID, err := projectState.EnsureCodeSectionAttachedTerminalForVariantWithSettings(projectID, plan.SectionID, plan.VariantID, s.newTerminalSeed(), settings)
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
		if impl.Terminal == nil || impl.Terminal.SessionMode != projectstate.TerminalSessionModeManagedConsole {
			continue
		}

		terminalID := terminals.BuildTerminalID(section.ID, shareSessionID)
		if s.terminals.ReusableSession(terminalID) {
			return section.ID, nil
		}
	}

	return "", nil
}

func (s *Service) structuralMutationSettings() (projectstate.StructuralMutationSettings, error) {
	if s == nil || s.settingsState == nil {
		return projectstate.DefaultStructuralMutationSettings(), nil
	}
	return settingsstate.StructuralMutationSettingsForDocument(s.settingsState.Snapshot().Document)
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

	batch, err := s.prepareDrawSnapshotBatch(projectState, artifactsRoot, projectID, refsBySectionID)
	if err != nil {
		return err
	}
	if err := writeDrawSnapshotFiles(batch.updates); err != nil {
		return err
	}
	if err := persistDrawSnapshotPaths(ctx, projectState, projectID, batch.renderedPathsBySectionID); err != nil {
		return err
	}
	if err := s.emitDrawSnapshotDeltas(ctx, projectID, shareSessionID, batch.updates); err != nil {
		return err
	}
	s.deleteDrawSnapshotPayloads(batch.updates)
	return nil
}

func (s *Service) prepareDrawSnapshotBatch(projectState *projectstate.Runtime, artifactsRoot string, projectID string, refsBySectionID map[string]binarypayload.ContentRef) (drawSnapshotBatch, error) {
	document := projectState.Snapshot().Document
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return drawSnapshotBatch{}, err
	}

	batch := drawSnapshotBatch{
		updates:                  make([]drawSnapshotUpdate, 0, len(refsBySectionID)),
		renderedPathsBySectionID: make(map[string]string, len(refsBySectionID)),
	}
	for sectionID, ref := range refsBySectionID {
		update, err := s.resolveDrawSnapshotUpdate(project, artifactsRoot, sectionID, ref)
		if err != nil {
			return drawSnapshotBatch{}, err
		}
		batch.updates = append(batch.updates, update)
		batch.renderedPathsBySectionID[sectionID] = update.path
	}
	return batch, nil
}

func (s *Service) resolveDrawSnapshotUpdate(project projectstate.Project, artifactsRoot string, sectionID string, ref binarypayload.ContentRef) (drawSnapshotUpdate, error) {
	_, _, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return drawSnapshotUpdate{}, err
	}
	if !impl.IsDraw() {
		return drawSnapshotUpdate{}, fmt.Errorf("%w: %q", projectstate.ErrDrawSectionRequired, sectionID)
	}

	targetPath, err := resolveDrawSnapshotPath(impl, artifactsRoot, sectionID)
	if err != nil {
		return drawSnapshotUpdate{}, err
	}
	payload, err := s.binaryStore.ReadBytes(ref.ContentID)
	if err != nil {
		return drawSnapshotUpdate{}, err
	}
	return drawSnapshotUpdate{
		sectionID: sectionID,
		path:      targetPath,
		ref:       ref,
		payload:   payload,
	}, nil
}

func resolveDrawSnapshotPath(impl projectstate.SectionImpl, artifactsRoot string, sectionID string) (string, error) {
	targetPath := strings.TrimSpace(impl.Draw.RenderedImagePath)
	if targetPath != "" {
		return targetPath, nil
	}
	return projectstate.BuildDrawSnapshotPath(sectionID, artifactsRoot)
}

func writeDrawSnapshotFiles(updates []drawSnapshotUpdate) error {
	for _, update := range updates {
		if err := statefs.AtomicWriteFile(update.path, update.payload, 0o644); err != nil {
			return fmt.Errorf("write draw snapshot %q: %w", update.sectionID, err)
		}
	}
	return nil
}

func persistDrawSnapshotPaths(ctx context.Context, projectState *projectstate.Runtime, projectID string, renderedPathsBySectionID map[string]string) error {
	if _, err := projectState.SetDrawSectionRenderedImagePaths(projectID, renderedPathsBySectionID); err != nil {
		return err
	}
	_, err := projectState.Save(ctx)
	return err
}

func (s *Service) emitDrawSnapshotDeltas(ctx context.Context, projectID string, shareSessionID string, updates []drawSnapshotUpdate) error {
	if s.listener == nil {
		return nil
	}
	deltas := make([]realtime.BinarySectionDelta, 0, len(updates))
	for _, update := range updates {
		deltas = append(deltas, realtime.BinarySectionDelta{
			SectionID:     update.sectionID,
			Value:         update.ref,
			BinaryPayload: update.payload,
		})
	}
	return s.listener.EmitSectionBinaryDeltas(ctx, realtime.EmitSectionBinaryDeltasParams{
		ProjectID:      projectID,
		ShareSessionID: shareSessionID,
		Deltas:         deltas,
	})
}

func (s *Service) deleteDrawSnapshotPayloads(updates []drawSnapshotUpdate) {
	for _, update := range updates {
		_ = s.binaryStore.Delete(update.ref.ContentID)
	}
}

func newRandomID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Sprintf("runs: generate random id: %v", err))
	}
	return hex.EncodeToString(buffer)
}
