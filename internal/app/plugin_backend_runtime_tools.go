package app

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/plugins"
)

func (r *pluginBackendRuntimeRefresher) buildRuntimeLocked(ctx context.Context, snapshot plugins.DiscoverySnapshot) (*pluginBackendMCPRuntime, error) {
	return newPluginBackendMCPRuntime(ctx, pluginBackendMCPRuntimeOptions{
		Logger:                 r.logger,
		RuntimeRoot:            r.runtimeRoot,
		Snapshot:               snapshot,
		ProjectRuntime:         r.projectState,
		BackendListenerInvoker: r.service,
	})
}

func (r *pluginBackendRuntimeRefresher) replaceRuntimeToolsLocked(previous *pluginBackendMCPRuntime, next *pluginBackendMCPRuntime) error {
	if r == nil || r.mcpServer == nil {
		return nil
	}

	removeNames := []string{}
	if previous != nil {
		removeNames = append(removeNames, previous.toolNames...)
	}

	nextRegistrations := []mcpx.ToolRegistration{}
	if next != nil {
		nextRegistrations = append(nextRegistrations, next.registrations...)
	}
	if err := r.mcpServer.ReplaceTools(removeNames, nextRegistrations); err != nil {
		return fmt.Errorf("replace plugin backend MCP tools: %w", err)
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) replaceLSPSpecsLocked(
	ctx context.Context,
	previous []lsp.LanguageServerSpec,
	next []lsp.LanguageServerSpec,
) error {
	if r == nil || r.lspRouter == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := r.lspRouter.ReplaceAdditionalSpecs(ctx, next); err != nil {
		rollbackCtx := context.Background()
		if rollbackErr := r.lspRouter.ReplaceAdditionalSpecs(rollbackCtx, previous); rollbackErr != nil && r.logger != nil {
			r.logger.Error("rollback plugin backend language servers after refresh failure", "error", rollbackErr)
		}
		return fmt.Errorf("replace plugin backend language servers: %w", err)
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) logPluginBackendRuntimeError(message string, err error) {
	if err == nil || r == nil || r.logger == nil {
		return
	}
	r.logger.Error(message, "error", err)
}

func (r *pluginBackendRuntimeRefresher) reconcileProjectDocumentLocked(
	ctx context.Context,
	previous []lsp.LanguageServerSpec,
	next []lsp.LanguageServerSpec,
	force bool,
) error {
	if r == nil || r.projectState == nil || r.projectSync == nil {
		return nil
	}
	if !force && languageServerSpecSlicesEqual(previous, next) {
		return nil
	}
	snapshot := r.projectState.Snapshot()
	return r.projectSync.Restart(ctx, snapshot.Document)
}

func (r *pluginBackendRuntimeRefresher) pluginHasAppliedLanguageServersLocked(pluginID string) bool {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}
	for _, spec := range r.appliedLSPSpecs {
		if strings.TrimSpace(spec.PluginID) == trimmedPluginID {
			return true
		}
	}
	return false
}

func (r *pluginBackendRuntimeRefresher) hasAppliedPluginLanguageServers(pluginID string) bool {
	if r == nil {
		return false
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	return r.pluginHasAppliedLanguageServersLocked(pluginID)
}
