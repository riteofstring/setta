package runs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/terminals"
)

var (
	ErrPlannerRequired         = fmt.Errorf("runs: planner is required")
	ErrTerminalServiceRequired = fmt.Errorf("runs: terminal service is required")
)

type ServiceOptions struct {
	Planner      *Planner
	ProjectState *projectstate.Runtime
	Terminals    *terminals.Service
	IDGenerator  func() string
}

type RunCodeRequest struct {
	ProjectID         string
	SectionID         string
	TerminalSectionID string
	RunSnapshotMode   RunSnapshotMode
	ShareSessionID    string
}

type RunCodeResult struct {
	Plan              Plan
	TerminalSectionID string
	TerminalID        string
	CreatedSession    bool
}

type Service struct {
	planner      *Planner
	projectState *projectstate.Runtime
	terminals    *terminals.Service
	idGenerator  func() string
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

	idGenerator := options.IDGenerator
	if idGenerator == nil {
		idGenerator = newRandomID
	}

	return &Service{
		planner:      options.Planner,
		projectState: options.ProjectState,
		terminals:    options.Terminals,
		idGenerator:  idGenerator,
	}, nil
}

func (s *Service) RunCode(ctx context.Context, request RunCodeRequest) (RunCodeResult, error) {
	if s == nil {
		return RunCodeResult{}, ErrPlannerRequired
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

func newRandomID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Sprintf("runs: generate random id: %v", err))
	}
	return hex.EncodeToString(buffer)
}
