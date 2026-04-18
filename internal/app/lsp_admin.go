package app

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/lsp"
	"setta/internal/projectstate"
)

type projectLSPAdmin interface {
	Restart(context.Context, projectstate.Document) error
	TypeCheckProject(context.Context, projectstate.Document, string) error
}

type runtimeLSPRefresher interface {
	RefreshLanguageServers(context.Context) error
	HasConfiguredLanguageServers() bool
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
		if err := a.runtime.RefreshLanguageServers(ctx); err != nil {
			return err
		}
		if !a.runtime.HasConfiguredLanguageServers() {
			if err := a.projectAdmin.Restart(ctx, document); err != nil {
				return err
			}
			return fmt.Errorf("%w: no selected language servers are available", lsp.ErrLanguageServerNotConfigured)
		}
	}
	return a.projectAdmin.Restart(ctx, document)
}

func (a *workspaceLSPAdmin) TypeCheckProject(ctx context.Context, document projectstate.Document, projectID string) error {
	if a == nil || a.projectAdmin == nil {
		return errors.New("lsp admin is not configured")
	}
	return a.projectAdmin.TypeCheckProject(ctx, document, projectID)
}
