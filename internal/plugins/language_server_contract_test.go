package plugins

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/lsp"
	"setta/internal/statefs"
	"setta/internal/testutil/firstpartyplugin"
)

type languageServerContractTarget struct {
	name                      string
	pluginID                  string
	languageID                string
	referenceFileName         string
	diagnosticsDocumentName   string
	diagnosticsBrokenContent  string
	diagnosticsClearedContent string
	completionContent         string
	completionCharacter       int
	signatureContent          string
	signatureCharacter        int
	configureValidEnv         func(t *testing.T)
	configureInvalidEnv       func(t *testing.T)
	linkSourceRoot            func(t *testing.T) string
	assertCompletion          func(t *testing.T, result lsp.CompletionResult)
	assertSignature           func(t *testing.T, result lsp.SignatureHelpResult)
}

type languageServerContractHarness struct {
	target             languageServerContractTarget
	roots              filesystemResolverTestRoots
	service            *Service
	router             *lsp.Router
	selectedByLanguage map[string]*string
	snapshot           DiscoverySnapshot
	ctx                context.Context
	cancel             context.CancelFunc
}

func TestFirstPartyBasedpyrightLanguageServerContract(t *testing.T) {
	runLanguageServerPluginContractSuite(t, languageServerContractTarget{
		name:                    "setta-basedpyright",
		pluginID:                "setta-basedpyright",
		languageID:              "python",
		referenceFileName:       "contract_reference.py",
		diagnosticsDocumentName: "contract_diagnostics.py",
		diagnosticsBrokenContent: strings.Join([]string{
			"value = unknown_symbol",
			"",
		}, "\n"),
		diagnosticsClearedContent: strings.Join([]string{
			"value = 1",
			"",
		}, "\n"),
		completionContent:   "str.",
		completionCharacter: len("str."),
		signatureContent:    "value = sorted(",
		signatureCharacter:  len("value = sorted("),
		configureValidEnv: func(t *testing.T) {
			t.Helper()
			t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))
		},
		configureInvalidEnv: func(t *testing.T) {
			t.Helper()
			t.Setenv("SETTA_LSP_COMMAND", filepath.Join(t.TempDir(), "missing-basedpyright-language-server"))
		},
		linkSourceRoot: func(t *testing.T) string {
			t.Helper()
			return filepath.Join(workerRPCTestRepoRoot(t), "plugins", "setta-basedpyright")
		},
		assertCompletion: func(t *testing.T, result lsp.CompletionResult) {
			t.Helper()
			if !completionResultContainsLabel(result, "upper") {
				t.Fatalf("expected basedpyright completion items to include upper, got %#v", result.Items)
			}
		},
		assertSignature: func(t *testing.T, result lsp.SignatureHelpResult) {
			t.Helper()
			if len(result.Signatures) == 0 {
				t.Fatalf("expected basedpyright signature help, got %#v", result.Signatures)
			}
			if len(result.Signatures[0].Parameters) == 0 {
				t.Fatalf("expected basedpyright signature params, got %#v", result.Signatures[0])
			}
			if !strings.Contains(result.Signatures[0].Label, "iterable") {
				t.Fatalf("expected sorted signature label, got %#v", result.Signatures[0].Label)
			}
		},
	})
}

func runLanguageServerPluginContractSuite(t *testing.T, target languageServerContractTarget) {
	t.Helper()

	t.Run("link_discovery_selection_and_lsp_features", func(t *testing.T) {
		harness := newLanguageServerContractHarness(t, target, false)

		entry := mustFindDiscoveredPlugin(t, harness.snapshot.Plugins, target.pluginID, PluginScopeWorkspace)
		if entry.State != PluginRuntimeStateActive {
			t.Fatalf("expected active discovered plugin after refresh, got %#v", entry.State)
		}
		if len(entry.RegisteredLanguageServers) != 1 {
			t.Fatalf("expected one discovered language server registration, got %#v", entry.RegisteredLanguageServers)
		}

		specs := harness.refreshSelectedSpecs(t, harness.selectedByLanguage)
		if len(specs) != 1 || specs[0].PluginID != target.pluginID {
			t.Fatalf("expected selected %s spec, got %#v", target.pluginID, specs)
		}

		target.assertCompletion(t, harness.completeSnapshot(t))
		target.assertSignature(t, harness.signatureHelpSnapshot(t))
		harness.assertDiagnosticsRoundTrip(t)
	})

	t.Run("selection_change_requires_explicit_refresh", func(t *testing.T) {
		harness := newLanguageServerContractHarness(t, target, false)
		target.assertCompletion(t, harness.completeSnapshot(t))

		clearedSelection := map[string]*string{
			target.languageID: nil,
		}
		if specs, err := harness.service.LanguageServerSpecs(context.Background(), clearedSelection); err != nil {
			t.Fatalf("load cleared language server specs: %v", err)
		} else if len(specs) != 0 {
			t.Fatalf("expected cleared selection to have no active specs, got %#v", specs)
		}

		target.assertCompletion(t, harness.completeSnapshot(t))

		harness.refreshSelectedSpecs(t, clearedSelection)
		harness.assertUnavailableSnapshotRequests(t)
	})

	t.Run("disabled_plugin_becomes_unavailable_after_refresh", func(t *testing.T) {
		harness := newLanguageServerContractHarness(t, target, false)

		result, err := harness.service.Disable(context.Background(), EnableDisableOptions{
			PluginID: target.pluginID,
		})
		if err != nil {
			t.Fatalf("disable %s: %v", target.pluginID, err)
		}
		if !result.RestartRequired {
			t.Fatalf("expected disabling %s to require refresh, got %#v", target.pluginID, result)
		}

		snapshot, err := harness.service.CommitBackendRuntimeRefresh()
		if err != nil {
			t.Fatalf("commit backend runtime refresh after disable: %v", err)
		}
		entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, target.pluginID, PluginScopeWorkspace)
		if entry.State != PluginRuntimeStateDisabled {
			t.Fatalf("expected disabled plugin state after refresh, got %#v", entry.State)
		}

		harness.refreshSelectedSpecs(t, harness.selectedByLanguage)
		harness.assertUnavailableSnapshotRequests(t)
	})

	t.Run("uninstalled_plugin_becomes_unavailable_after_refresh", func(t *testing.T) {
		harness := newLanguageServerContractHarness(t, target, false)

		result, err := harness.service.Uninstall(context.Background(), UninstallOptions{
			PluginID: target.pluginID,
			Scope:    scopePointer(PluginScopeWorkspace),
		})
		if err != nil {
			t.Fatalf("uninstall %s: %v", target.pluginID, err)
		}
		if !result.RestartRequired {
			t.Fatalf("expected uninstalling %s to require refresh, got %#v", target.pluginID, result)
		}

		snapshot, err := harness.service.CommitBackendRuntimeRefresh()
		if err != nil {
			t.Fatalf("commit backend runtime refresh after uninstall: %v", err)
		}
		if len(snapshot.Plugins) != 0 {
			t.Fatalf("expected uninstalled plugin to disappear after refresh, got %#v", snapshot.Plugins)
		}

		harness.refreshSelectedSpecs(t, harness.selectedByLanguage)
		harness.assertUnavailableSnapshotRequests(t)
	})

	t.Run("invalid_command_keeps_selected_plugin_unavailable", func(t *testing.T) {
		harness := newLanguageServerContractHarness(t, target, true)

		entry := mustFindDiscoveredPlugin(t, harness.snapshot.Plugins, target.pluginID, PluginScopeWorkspace)
		if entry.State != PluginRuntimeStateInvalid {
			t.Fatalf("expected invalid plugin state with missing interpreter, got %#v", entry.State)
		}
		if len(entry.Errors) == 0 {
			t.Fatalf("expected backend probe error for invalid %s command", target.pluginID)
		}

		specs := harness.refreshSelectedSpecs(t, harness.selectedByLanguage)
		if len(specs) != 0 {
			t.Fatalf("expected invalid plugin to contribute no language server specs, got %#v", specs)
		}
		harness.assertUnavailableSnapshotRequests(t)
	})
}

func newLanguageServerContractHarness(t *testing.T, target languageServerContractTarget, invalidEnv bool) *languageServerContractHarness {
	t.Helper()

	if invalidEnv {
		target.configureInvalidEnv(t)
	} else {
		target.configureValidEnv(t)
	}

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: target.linkSourceRoot(t),
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
	})
	if err != nil {
		t.Fatalf("link plugin %s: %v", target.pluginID, err)
	}
	if !linkResult.RestartRequired {
		t.Fatalf("expected linked backend plugin %s to require refresh, got %#v", target.pluginID, linkResult)
	}

	snapshot, err := service.CommitBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("commit backend runtime refresh for %s: %v", target.pluginID, err)
	}

	selectedByLanguage := map[string]*string{
		target.languageID: stringPointer(target.pluginID),
	}
	specs, err := service.LanguageServerSpecs(context.Background(), selectedByLanguage)
	if err != nil {
		t.Fatalf("load language server specs for %s: %v", target.pluginID, err)
	}
	router, err := lsp.NewRouter(lsp.RouterOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		AdditionalSpecs: specs,
	})
	if err != nil {
		t.Fatalf("new router for %s: %v", target.pluginID, err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	harness := &languageServerContractHarness{
		target:             target,
		roots:              roots,
		service:            service,
		router:             router,
		selectedByLanguage: selectedByLanguage,
		snapshot:           snapshot,
		ctx:                ctx,
		cancel:             cancel,
	}
	t.Cleanup(func() {
		cancel()
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router for %s: %v", target.pluginID, err)
		}
	})
	return harness
}

func (h *languageServerContractHarness) refreshSelectedSpecs(t *testing.T, selectedByLanguage map[string]*string) []lsp.LanguageServerSpec {
	t.Helper()

	specs, err := h.service.LanguageServerSpecs(context.Background(), selectedByLanguage)
	if err != nil {
		t.Fatalf("load language server specs: %v", err)
	}
	if err := h.router.ReplaceAdditionalSpecs(h.ctx, specs); err != nil {
		t.Fatalf("replace router specs: %v", err)
	}
	return specs
}

func (h *languageServerContractHarness) completeSnapshot(t *testing.T) lsp.CompletionResult {
	t.Helper()

	referencePath := filepath.Join(h.roots.workspaceRoot, h.target.referenceFileName)
	if err := statefs.AtomicWriteFile(referencePath, []byte("value = 1\n"), 0o644); err != nil {
		t.Fatalf("write completion reference file: %v", err)
	}

	result, err := h.router.CompleteSnapshot(h.ctx, lsp.SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    h.target.languageID,
		Content:       h.target.completionContent,
		Line:          0,
		Character:     h.target.completionCharacter,
	})
	if err != nil {
		t.Fatalf("complete snapshot: %v", err)
	}
	return result
}

func (h *languageServerContractHarness) signatureHelpSnapshot(t *testing.T) lsp.SignatureHelpResult {
	t.Helper()

	referencePath := filepath.Join(h.roots.workspaceRoot, h.target.referenceFileName)
	if err := statefs.AtomicWriteFile(referencePath, []byte("value = 1\n"), 0o644); err != nil {
		t.Fatalf("write signature reference file: %v", err)
	}

	result, err := h.router.SignatureHelpSnapshot(h.ctx, lsp.SnapshotSignatureHelpRequest{
		ReferencePath: referencePath,
		LanguageID:    h.target.languageID,
		Content:       h.target.signatureContent,
		Line:          0,
		Character:     h.target.signatureCharacter,
	})
	if err != nil {
		t.Fatalf("signature help snapshot: %v", err)
	}
	return result
}

func (h *languageServerContractHarness) assertDiagnosticsRoundTrip(t *testing.T) {
	t.Helper()

	documentPath := filepath.Join(h.roots.workspaceRoot, h.target.diagnosticsDocumentName)
	if err := statefs.AtomicWriteFile(documentPath, []byte(h.target.diagnosticsBrokenContent), 0o644); err != nil {
		t.Fatalf("write diagnostics test file: %v", err)
	}

	diagnosticsCh := make(chan lsp.PublishDiagnosticsParams, 8)
	callback := func(params lsp.PublishDiagnosticsParams) {
		diagnosticsCh <- params
	}

	if err := h.router.UpsertDocument(h.ctx, lsp.SyncedDocument{
		Path:       documentPath,
		LanguageID: h.target.languageID,
		Content:    h.target.diagnosticsBrokenContent,
		Callback:   callback,
	}); err != nil {
		t.Fatalf("upsert broken diagnostics document: %v", err)
	}

	withDiagnostics := waitForDiagnosticsMatch(t, diagnosticsCh, 10*time.Second, func(params lsp.PublishDiagnosticsParams) bool {
		return len(params.Diagnostics) > 0
	})
	if len(withDiagnostics.Diagnostics) == 0 {
		t.Fatalf("expected diagnostics for broken content, got %#v", withDiagnostics.Diagnostics)
	}

	if err := h.router.UpsertDocument(h.ctx, lsp.SyncedDocument{
		Path:       documentPath,
		LanguageID: h.target.languageID,
		Content:    h.target.diagnosticsClearedContent,
		Callback:   callback,
	}); err != nil {
		t.Fatalf("upsert cleared diagnostics document: %v", err)
	}

	clearedDiagnostics := waitForDiagnosticsMatch(t, diagnosticsCh, 10*time.Second, func(params lsp.PublishDiagnosticsParams) bool {
		return len(params.Diagnostics) == 0
	})
	if len(clearedDiagnostics.Diagnostics) != 0 {
		t.Fatalf("expected cleared diagnostics after update, got %#v", clearedDiagnostics.Diagnostics)
	}
}

func (h *languageServerContractHarness) assertUnavailableSnapshotRequests(t *testing.T) {
	t.Helper()

	referencePath := filepath.Join(h.roots.workspaceRoot, h.target.referenceFileName)
	if err := statefs.AtomicWriteFile(referencePath, []byte("value = 1\n"), 0o644); err != nil {
		t.Fatalf("write unavailable reference file: %v", err)
	}

	_, err := h.router.CompleteSnapshot(h.ctx, lsp.SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    h.target.languageID,
		Content:       h.target.completionContent,
		Line:          0,
		Character:     h.target.completionCharacter,
	})
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected completion to report unconfigured language server, got %v", err)
	}

	_, err = h.router.SignatureHelpSnapshot(h.ctx, lsp.SnapshotSignatureHelpRequest{
		ReferencePath: referencePath,
		LanguageID:    h.target.languageID,
		Content:       h.target.signatureContent,
		Line:          0,
		Character:     h.target.signatureCharacter,
	})
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected signature help to report unconfigured language server, got %v", err)
	}
}

func completionResultContainsLabel(result lsp.CompletionResult, label string) bool {
	for _, item := range result.Items {
		if item.Label == label {
			return true
		}
	}
	return false
}

func waitForDiagnosticsMatch(t *testing.T, diagnosticsCh <-chan lsp.PublishDiagnosticsParams, timeout time.Duration, match func(lsp.PublishDiagnosticsParams) bool) lsp.PublishDiagnosticsParams {
	t.Helper()

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	last := lsp.PublishDiagnosticsParams{}
	for {
		select {
		case params := <-diagnosticsCh:
			last = params
			if match(params) {
				return params
			}
		case <-timer.C:
			t.Fatalf("timed out waiting for matching diagnostics; last payload %#v", last)
		}
	}
}
