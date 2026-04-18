package app

import (
	"context"
	"errors"

	"setta/internal/plugins"
	"setta/internal/projectstate"
)

type projectLSPAdmin interface {
	Restart(context.Context, projectstate.Document) error
	TypeCheckProject(context.Context, projectstate.Document, string) error
}

type runtimeLSPRefresher interface {
	Refresh(context.Context) (plugins.DiscoverySnapshot, error)
	HasConfiguredLanguageServers() bool
	RestartProject(context.Context, func() error) error
}

type workspaceLSPAdmin struct {
	projectAdmin projectLSPAdmin
	runtime      runtimeLSPRefresher
}

func newWorkspaceLSPAdmin(projectAdmin projectLSPAdmin, runtime runtimeLSPRefresher) *workspaceLSPAdmin {
	if projectAdmin == nil {
		return nil
	}
	return &workspaceLSPAdmin{
		projectAdmin: projectAdmin,
		runtime:      runtime,
	}
}

func (a *workspaceLSPAdmin) Restart(ctx context.Context, document projectstate.Document) error {
	if a == nil || a.projectAdmin == nil {
		return errors.New("lsp admin is not configured")
	}
	if a.runtime != nil {
		return a.runtime.RestartProject(ctx, func() error {
			return a.projectAdmin.Restart(ctx, document)
		})
	}
	return a.projectAdmin.Restart(ctx, document)
}

func (a *workspaceLSPAdmin) TypeCheckProject(ctx context.Context, document projectstate.Document, projectID string) error {
	if a == nil || a.projectAdmin == nil {
		return errors.New("lsp admin is not configured")
	}
	return a.projectAdmin.TypeCheckProject(ctx, document, projectID)
}
