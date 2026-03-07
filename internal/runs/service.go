package runs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	binarypayload "setta/internal/binary"
	"setta/internal/projectstate"
	"setta/internal/statefs"
	"setta/internal/terminals"
)

var (
	ErrPlannerRequired         = fmt.Errorf("runs: planner is required")
	ErrTerminalServiceRequired = fmt.Errorf("runs: terminal service is required")
	ErrBinaryStoreRequired     = fmt.Errorf("runs: binary store is required")
	ErrArtifactsRootRequired   = fmt.Errorf("runs: artifacts root is required")
)

type ServiceOptions struct {
	Planner       *Planner
	ProjectState  *projectstate.Runtime
	Terminals     *terminals.Service
	BinaryStore   *binarypayload.Store
	ArtifactsRoot string
	IDGenerator   func() string
}

type RunCodeRequest struct {
	ProjectID                string
	SectionID                string
	TerminalSectionID        string
	RunSnapshotMode          RunSnapshotMode
	DrawSnapshotsBySectionID map[string]binarypayload.ContentRef
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
	terminals     *terminals.Service
	binaryStore   *binarypayload.Store
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
		terminals:     options.Terminals,
		binaryStore:   options.BinaryStore,
		artifactsRoot: resolvedArtifactsRoot,
		idGenerator:   idGenerator,
	}, nil
}

func (s *Service) RunCode(ctx context.Context, request RunCodeRequest) (RunCodeResult, error) {
	if s == nil {
		return RunCodeResult{}, ErrPlannerRequired
	}
	if err := s.applyDrawSnapshots(ctx, request.ProjectID, request.DrawSnapshotsBySectionID); err != nil {
		return RunCodeResult{}, err
	}

	plan, err := s.planner.Plan(PlanRequest{
		ProjectID:       request.ProjectID,
		SectionID:       request.SectionID,
		RunSnapshotMode: request.RunSnapshotMode,
	})
	if err != nil {
		return RunCodeResult{}, err
	}

	terminalSectionID, err := s.resolveTerminalSection(ctx, request.ProjectID, plan.SectionID, request.TerminalSectionID)
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
	if err := s.terminals.Write(terminalID, []byte(command)); err != nil {
		return RunCodeResult{}, err
	}

	return RunCodeResult{
		Plan:              plan,
		TerminalSectionID: terminalSectionID,
		TerminalID:        terminalID,
		CreatedSession:    createdSession,
	}, nil
}

func (s *Service) resolveTerminalSection(ctx context.Context, projectID string, sectionID string, explicitTerminalSectionID string) (string, error) {
	document := s.projectState.Snapshot().Document
	validExplicitTerminal, err := document.ValidateAttachedTerminal(projectID, sectionID, explicitTerminalSectionID)
	if err != nil {
		return "", err
	}
	if validExplicitTerminal {
		return strings.TrimSpace(explicitTerminalSectionID), nil
	}

	_, terminalSectionID, err := s.projectState.EnsureCodeSectionAttachedTerminal(projectID, sectionID, s.newTerminalSeed())
	if err != nil {
		return "", err
	}
	if _, err := s.projectState.Save(ctx); err != nil {
		return "", err
	}
	return terminalSectionID, nil
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

func (s *Service) applyDrawSnapshots(ctx context.Context, projectID string, refsBySectionID map[string]binarypayload.ContentRef) error {
	if len(refsBySectionID) == 0 {
		return nil
	}

	document := s.projectState.Snapshot().Document
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}

	type drawSnapshotUpdate struct {
		sectionID string
		path      string
		contentID string
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
			targetPath, err = projectstate.BuildDrawSnapshotPath(sectionID, s.artifactsRoot)
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
			contentID: ref.ContentID,
			payload:   payload,
		})
		renderedPathsBySectionID[sectionID] = targetPath
	}

	for _, update := range updates {
		if err := statefs.AtomicWriteFile(update.path, update.payload, 0o644); err != nil {
			return fmt.Errorf("write draw snapshot %q: %w", update.sectionID, err)
		}
	}

	if _, err := s.projectState.SetDrawSectionRenderedImagePaths(projectID, renderedPathsBySectionID); err != nil {
		return err
	}
	if _, err := s.projectState.Save(ctx); err != nil {
		return err
	}
	for _, update := range updates {
		_ = s.binaryStore.Delete(update.contentID)
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
