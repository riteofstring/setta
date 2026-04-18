package app

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/lsp"
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
	if err := a.ensureConfiguredLanguageServers(ctx); err != nil {
		return err
	}
	return a.projectAdmin.Restart(ctx, document)
}

func (a *workspaceLSPAdmin) TypeCheckProject(ctx context.Context, document projectstate.Document, projectID string) error {
	if a == nil || a.projectAdmin == nil {
		return errors.New("lsp admin is not configured")
	}
	if _, err := document.ProjectByID(projectID); err == nil {
		if err := a.ensureConfiguredLanguageServers(ctx); err != nil {
			return err
		}
	} else if !errors.Is(err, projectstate.ErrProjectNotFound) && !errors.Is(err, projectstate.ErrProjectIDRequired) {
		return err
	}
	return a.projectAdmin.TypeCheckProject(ctx, document, projectID)
}

func (a *workspaceLSPAdmin) ensureConfiguredLanguageServers(ctx context.Context) error {
	if a == nil || a.runtime == nil {
		return nil
	}
	if _, err := a.runtime.Refresh(ctx); err != nil {
		return err
	}
	if !a.runtime.HasConfiguredLanguageServers() {
		return fmt.Errorf("%w: no selected language servers are available", lsp.ErrLanguageServerNotConfigured)
	}
	return nil
}
