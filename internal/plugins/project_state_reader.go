package plugins

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

const (
	ProjectStateViewFull    = "full"
	ProjectStateViewSummary = "summary"
)

var (
	ErrProjectStateReaderUnavailable = errors.New("plugins: project state reader is unavailable")
)

type ProjectStateReadRequest struct {
	ProjectID      string `json:"projectConfigId"`
	ShareSessionID string `json:"shareSessionId,omitempty"`
	View           string `json:"view"`
}

type ProjectStateReadResult struct {
	ProjectState any    `json:"projectState"`
	View         string `json:"view"`
}

type ProjectStateReader interface {
	ReadProjectState(context.Context, ProjectStateReadRequest) (ProjectStateReadResult, error)
}

type RuntimeProjectStateReaderOptions struct {
	ProjectState *projectstate.Runtime
	Deployment   *deployments.Runtime
}

type RuntimeProjectStateReader struct {
	projectState *projectstate.Runtime
	deployment   *deployments.Runtime
}

func NewRuntimeProjectStateReader(options RuntimeProjectStateReaderOptions) (*RuntimeProjectStateReader, error) {
	if options.ProjectState == nil && options.Deployment == nil {
		return nil, ErrProjectStateReaderUnavailable
	}
	return &RuntimeProjectStateReader{
		projectState: options.ProjectState,
		deployment:   options.Deployment,
	}, nil
}

func (r *RuntimeProjectStateReader) ReadProjectState(_ context.Context, request ProjectStateReadRequest) (ProjectStateReadResult, error) {
	if r == nil || (r.projectState == nil && r.deployment == nil) {
		return ProjectStateReadResult{}, ErrProjectStateReaderUnavailable
	}

	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" {
		return ProjectStateReadResult{}, projectstate.ErrProjectIDRequired
	}

	view := strings.TrimSpace(request.View)
	if view == "" {
		view = ProjectStateViewSummary
	}

	snapshot, err := r.snapshot(strings.TrimSpace(request.ShareSessionID))
	if err != nil {
		return ProjectStateReadResult{}, err
	}

	projectView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return ProjectStateReadResult{}, err
	}

	result := ProjectStateReadResult{View: view}
	switch view {
	case ProjectStateViewSummary:
		result.ProjectState = projectview.BuildProjectStateSummary(projectView, allProjectStateSectionIDs(projectView))
	case ProjectStateViewFull:
		result.ProjectState = projectView
	default:
		return ProjectStateReadResult{}, fmt.Errorf("invalid project state view %q", view)
	}
	return result, nil
}

func (r *RuntimeProjectStateReader) snapshot(shareSessionID string) (projectstate.Snapshot, error) {
	if r == nil {
		return projectstate.Snapshot{}, ErrProjectStateReaderUnavailable
	}
	if r.deployment != nil && shareSessionID != "" {
		if err := r.deployment.TouchSession(shareSessionID); err != nil {
			return projectstate.Snapshot{}, err
		}
		return r.deployment.SessionSnapshot(shareSessionID)
	}
	if r.projectState != nil {
		return r.projectState.Snapshot(), nil
	}
	if r.deployment != nil {
		return projectstate.Snapshot{}, ErrWorkerHostShareSessionRequired
	}
	return projectstate.Snapshot{}, ErrProjectStateReaderUnavailable
}

func allProjectStateSectionIDs(projectView projectview.SingleConfig) map[string]struct{} {
	sectionIDs := make(map[string]struct{}, len(projectView.Sections)+len(projectView.ProjectConfig.SectionVariantMap))
	for sectionID := range projectView.Sections {
		sectionIDs[sectionID] = struct{}{}
	}
	for sectionID := range projectView.ProjectConfig.SectionVariantMap {
		sectionIDs[sectionID] = struct{}{}
	}
	return sectionIDs
}
