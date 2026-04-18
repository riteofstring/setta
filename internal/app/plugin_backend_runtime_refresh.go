package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

type pluginBackendRuntimeRefresher struct {
	service        pluginBackendRefreshService
	logger         *slog.Logger
	runtimeRoot    string
	mcpServer      pluginBackendToolReplacer
	settings       *settingsstate.Runtime
	projectState   pluginBackendProjectSnapshotter
	projectLSPSync pluginBackendProjectDocumentMaterializer
	runtime        *pluginBackendMCPRuntime
	lspRouter      pluginBackendLanguageServerReplacer
	lspSpecs       []lsp.LanguageServerSpec

	mu sync.Mutex
}

type pluginBackendRefreshService interface {
	Rescan() (plugins.DiscoverySnapshot, error)
	PreviewBackendRuntimeRefresh() (plugins.DiscoverySnapshot, error)
	CommitBackendRuntimeRefresh() (plugins.DiscoverySnapshot, error)
	LanguageServerSpecsForSnapshot(snapshot plugins.DiscoverySnapshot, selectedByLanguage map[string]*string) ([]lsp.LanguageServerSpec, error)
}

type pluginBackendToolReplacer interface {
	ReplaceTools(removeNames []string, registrations []mcpx.ToolRegistration) error
}

type pluginBackendLanguageServerReplacer interface {
	ReplaceAdditionalSpecs(ctx context.Context, specs []lsp.LanguageServerSpec) error
}

type pluginBackendProjectSnapshotter interface {
	Snapshot() projectstate.Snapshot
}

type pluginBackendProjectDocumentMaterializer interface {
	MaterializeDocument(context.Context, projectstate.Document) error
}

type pluginBackendRuntimeTransition struct {
	nextRuntime     *pluginBackendMCPRuntime
	previousRuntime *pluginBackendMCPRuntime
}

type pluginBackendRestartTransition struct {
	selectedByLanguage map[string]*string
	nextRuntime        *pluginBackendMCPRuntime
	nextLSPSpecs       []lsp.LanguageServerSpec
	previousRuntime    *pluginBackendMCPRuntime
	previousLSPSpecs   []lsp.LanguageServerSpec
}

const pluginBackendRestartRollbackTimeout = 10 * time.Second

type pluginMutationRuntimeService struct {
	base      *plugins.Service
	refresher *pluginBackendRuntimeRefresher
}

func newPluginMutationRuntimeService(base *plugins.Service, refresher *pluginBackendRuntimeRefresher) *pluginMutationRuntimeService {
	return &pluginMutationRuntimeService{
		base:      base,
		refresher: refresher,
	}
}

func (s *pluginMutationRuntimeService) Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	response, err := s.base.Runtime(options)
	if err != nil || s.refresher == nil {
		return response, err
	}
	response.Status.SelectedLanguageServers = s.refresher.SelectedLanguageServerStatuses(response.Status.Plugins)
	return response, nil
}

func (s *pluginMutationRuntimeService) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	return s.base.ResolveAssetPath(pluginID, assetPath)
}

func (s *pluginMutationRuntimeService) ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error) {
	return s.base.ResolveRegisteredStaticAssetPath(requestPath)
}

func (s *pluginMutationRuntimeService) LookupRegisteredBackendRoute(method string, requestPath string) (plugins.BackendRouteLookup, error) {
	return s.base.LookupRegisteredBackendRoute(method, requestPath)
}

func (s *pluginMutationRuntimeService) DispatchRegisteredBackendRoute(
	ctx context.Context,
	request plugins.BackendHTTPRequest,
) (plugins.BackendHTTPResponse, bool, error) {
	return s.base.DispatchRegisteredBackendRoute(ctx, request)
}

func (s *pluginMutationRuntimeService) InvokeRegisteredListenerEndpoint(
	ctx context.Context,
	request plugins.BackendListenerEndpointRequest,
) (any, bool, error) {
	return s.base.InvokeRegisteredListenerEndpoint(ctx, request)
}

func (s *pluginMutationRuntimeService) Rescan() (plugins.DiscoverySnapshot, error) {
	snapshot, err := s.base.Rescan()
	if err != nil || s.refresher == nil {
		return snapshot, err
	}
	return s.refresher.Refresh(context.Background())
}

func (s *pluginMutationRuntimeService) Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	result, err := s.base.Install(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return result, err
	}
	if entry, ok := findPluginInScope(snapshot.Plugins, result.PluginID, result.SourceScope); ok {
		result.State = entry.State
		result.Version = entry.Version
		result.SourcePath = entry.SourcePath
		result.SourceDigestSHA256 = cloneOptionalDigest(entry.SourceDigestSHA256)
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Link(options plugins.LinkOptions) (plugins.PluginInstallResponse, error) {
	result, err := s.base.Link(options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(context.Background())
	if err != nil {
		return result, err
	}
	if entry, ok := findPluginInScope(snapshot.Plugins, result.PluginID, result.SourceScope); ok {
		result.State = entry.State
		result.Version = entry.Version
		result.SourcePath = entry.SourcePath
		result.SourceDigestSHA256 = cloneOptionalDigest(entry.SourceDigestSHA256)
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	result, err := s.base.Uninstall(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	result, err := s.base.Update(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	result, err := s.base.Rollback(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	result, err := s.base.Enable(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return result, err
	}
	if entry, ok := findHighestPrecedencePlugin(snapshot.Plugins, result.PluginID); ok {
		result.State = entry.State
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResponse, error) {
	result, err := s.base.Disable(ctx, options)
	if err != nil || s.refresher == nil || !result.RestartRequired {
		return result, err
	}
	snapshot, err := s.refresher.Refresh(ctx)
	if err != nil {
		return result, err
	}
	if entry, ok := findHighestPrecedencePlugin(snapshot.Plugins, result.PluginID); ok {
		result.State = entry.State
	}
	result.RestartRequired = false
	return result, nil
}

func (s *pluginMutationRuntimeService) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	if s.refresher == nil {
		return s.base.WriteConfig(ctx, options)
	}
	return s.base.WriteConfigTransactional(ctx, options, func(response plugins.PluginConfigWriteResponse) error {
		return s.refresher.ReapplyAppliedLanguageServerPluginConfig(ctx, response.PluginID)
	})
}

func (s *pluginMutationRuntimeService) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	return s.base.GetBackendUISettings(pluginID)
}

func (s *pluginMutationRuntimeService) ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	return s.base.ReadBackendUISettingValue(ctx, options)
}

func (s *pluginMutationRuntimeService) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	return s.base.WriteBackendUISettingValue(ctx, options)
}

func (s *pluginMutationRuntimeService) WriteLockfile() (plugins.PluginLockWriteResponse, error) {
	return s.base.WriteLockfile()
}

func (s *pluginMutationRuntimeService) ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResponse, error) {
	result, err := s.base.ApplyLockfile(ctx, check)
	if err != nil || s.refresher == nil || !result.Applied || check {
		return result, err
	}
	if _, err := s.refresher.Refresh(ctx); err != nil {
		return result, err
	}
	return result, nil
}

func (s *pluginMutationRuntimeService) Restart(ctx context.Context) (plugins.PluginRestartResponse, error) {
	return s.base.Restart(ctx)
}

func (r *pluginBackendRuntimeRefresher) Initialize(ctx context.Context) error {
	if r == nil || r.service == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	snapshot, err := r.service.Rescan()
	if err != nil {
		return err
	}
	nextLSPSpecs, err := r.selectedLanguageServerSpecs(snapshot)
	if err != nil {
		return err
	}
	nextRuntime, err := r.buildRuntimeLocked(ctx, snapshot)
	if err != nil {
		return err
	}
	if err := r.replaceRuntimeToolsLocked(nil, nextRuntime); err != nil {
		_ = nextRuntime.Close(context.Background())
		return err
	}
	if err := r.replaceLSPSpecsLocked(ctx, nil, nextLSPSpecs); err != nil {
		if rollbackErr := r.replaceRuntimeToolsLocked(nextRuntime, nil); rollbackErr != nil && r.logger != nil {
			r.logger.Error("rollback plugin backend MCP tools after LSP initialization failure", "error", rollbackErr)
		}
		_ = nextRuntime.Close(context.Background())
		return err
	}
	r.runtime = nextRuntime
	r.lspSpecs = lsp.CloneLanguageServerSpecs(nextLSPSpecs)
	return nil
}

func (r *pluginBackendRuntimeRefresher) Refresh(ctx context.Context) (plugins.DiscoverySnapshot, error) {
	if r == nil || r.service == nil {
		return plugins.DiscoverySnapshot{}, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	transition, err := r.prepareRuntimeRefreshTransitionLocked(ctx)
	if err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	if err := r.applyRuntimeRefreshTransitionLocked(transition); err != nil {
		return plugins.DiscoverySnapshot{}, err
	}
	return r.commitRuntimeRefreshTransitionLocked(transition)
}

func (r *pluginBackendRuntimeRefresher) RestartProject(
	ctx context.Context,
	document projectstate.Document,
	restart func(context.Context) error,
) error {
	if restart == nil {
		return errors.New("project restart callback is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if r == nil || r.service == nil {
		return restart(ctx)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	transition, err := r.prepareRestartTransitionLocked(ctx)
	if err != nil {
		return err
	}
	restartProjectLanguages, err := collectRestartProjectLanguages(document)
	if err != nil {
		closePluginBackendRuntime(transition.nextRuntime)
		return err
	}
	if !restartCanApplyToProjectLanguages(
		restartProjectLanguages,
		transition.selectedByLanguage,
		transition.previousLSPSpecs,
		transition.nextLSPSpecs,
	) {
		closePluginBackendRuntime(transition.nextRuntime)
		return fmt.Errorf(
			"%w: no selected language servers are available for the current project",
			lsp.ErrLanguageServerNotConfigured,
		)
	}
	if err := r.applyRestartTransitionLocked(ctx, transition); err != nil {
		return err
	}
	if err := restart(ctx); err != nil {
		r.rollbackRestartTransitionLocked(transition)
		return restorePreviousProjectSession(restart, err)
	}
	if _, err := r.commitRestartTransitionLocked(transition); err != nil {
		return restorePreviousProjectSession(restart, err)
	}
	return nil
}

func collectRestartProjectLanguages(document projectstate.Document) (map[string]struct{}, error) {
	normalized, err := document.Normalized()
	if err != nil {
		return nil, err
	}

	languages := map[string]struct{}{}
	projectIDs := make([]string, 0, len(normalized.Projects))
	for projectID := range normalized.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		project := normalized.Projects[projectID]
		activeCodeSectionFiles, err := project.ActiveCodeSectionFiles()
		if err != nil {
			return nil, err
		}
		for _, sectionFile := range activeCodeSectionFiles {
			languageID := normalizeTrackedLanguage(string(sectionFile.Language))
			if languageID == "" {
				continue
			}
			languages[languageID] = struct{}{}
		}
		if project.HasPythonCodegenTarget() {
			languages["python"] = struct{}{}
		}
	}
	return languages, nil
}

func restartCanApplyToProjectLanguages(
	projectLanguages map[string]struct{},
	selectedByLanguage map[string]*string,
	previousSpecs []lsp.LanguageServerSpec,
	nextSpecs []lsp.LanguageServerSpec,
) bool {
	requiredLanguages := restartRequiredProjectLanguages(
		projectLanguages,
		selectedByLanguage,
		previousSpecs,
		nextSpecs,
	)
	if len(requiredLanguages) == 0 {
		return true
	}
	nextLanguages := languageServerSpecLanguages(nextSpecs)
	for languageID := range requiredLanguages {
		if selection, ok := selectedByLanguage[languageID]; ok && selection == nil {
			continue
		}
		if _, ok := nextLanguages[languageID]; ok {
			continue
		}
		return false
	}
	return true
}

func restartRequiredProjectLanguages(
	projectLanguages map[string]struct{},
	selectedByLanguage map[string]*string,
	previousSpecs []lsp.LanguageServerSpec,
	nextSpecs []lsp.LanguageServerSpec,
) map[string]struct{} {
	if len(projectLanguages) == 0 {
		return nil
	}

	requiredLanguages := map[string]struct{}{}
	previousLanguages := languageServerSpecLanguages(previousSpecs)
	nextLanguages := languageServerSpecLanguages(nextSpecs)
	selectedLanguages := selectedLanguageKeys(selectedByLanguage)

	if _, ok := projectLanguages["python"]; ok {
		requiredLanguages["python"] = struct{}{}
	}

	for languageID := range projectLanguages {
		if _, ok := previousLanguages[languageID]; ok {
			requiredLanguages[languageID] = struct{}{}
			continue
		}
		if _, ok := nextLanguages[languageID]; ok {
			requiredLanguages[languageID] = struct{}{}
			continue
		}
		if _, ok := selectedLanguages[languageID]; ok {
			requiredLanguages[languageID] = struct{}{}
		}
	}
	return requiredLanguages
}

func languageServerSpecLanguages(specs []lsp.LanguageServerSpec) map[string]struct{} {
	languages := make(map[string]struct{}, len(specs))
	for _, spec := range specs {
		languageID := normalizeTrackedLanguage(spec.LanguageID)
		if languageID == "" {
			continue
		}
		languages[languageID] = struct{}{}
	}
	return languages
}

func selectedLanguageKeys(selectedByLanguage map[string]*string) map[string]struct{} {
	if len(selectedByLanguage) == 0 {
		return nil
	}
	languages := make(map[string]struct{}, len(selectedByLanguage))
	for languageID := range selectedByLanguage {
		normalizedLanguage := normalizeTrackedLanguage(languageID)
		if normalizedLanguage == "" {
			continue
		}
		languages[normalizedLanguage] = struct{}{}
	}
	return languages
}

func (r *pluginBackendRuntimeRefresher) prepareRuntimeRefreshTransitionLocked(
	ctx context.Context,
) (*pluginBackendRuntimeTransition, error) {
	previewSnapshot, err := r.service.PreviewBackendRuntimeRefresh()
	if err != nil {
		return nil, err
	}

	nextRuntime, err := r.buildRuntimeLocked(ctx, previewSnapshot)
	if err != nil {
		return nil, err
	}
	return &pluginBackendRuntimeTransition{
		nextRuntime:     nextRuntime,
		previousRuntime: r.runtime,
	}, nil
}

func (r *pluginBackendRuntimeRefresher) prepareRestartTransitionLocked(
	ctx context.Context,
) (*pluginBackendRestartTransition, error) {
	previewSnapshot, err := r.service.PreviewBackendRuntimeRefresh()
	if err != nil {
		return nil, err
	}

	selectedByLanguage, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, err
	}
	nextLSPSpecs, err := r.service.LanguageServerSpecsForSnapshot(previewSnapshot, selectedByLanguage)
	if err != nil {
		return nil, err
	}
	nextRuntime, err := r.buildRuntimeLocked(ctx, previewSnapshot)
	if err != nil {
		return nil, err
	}
	return &pluginBackendRestartTransition{
		selectedByLanguage: cloneSelectedLanguageServerPlugins(selectedByLanguage),
		nextRuntime:        nextRuntime,
		nextLSPSpecs:       nextLSPSpecs,
		previousRuntime:    r.runtime,
		previousLSPSpecs:   lsp.CloneLanguageServerSpecs(r.lspSpecs),
	}, nil
}

func (r *pluginBackendRuntimeRefresher) applyRuntimeRefreshTransitionLocked(
	transition *pluginBackendRuntimeTransition,
) error {
	if err := r.replaceRuntimeToolsLocked(transition.previousRuntime, transition.nextRuntime); err != nil {
		closePluginBackendRuntime(transition.nextRuntime)
		return err
	}
	r.runtime = transition.nextRuntime
	return nil
}

func (r *pluginBackendRuntimeRefresher) applyRestartTransitionLocked(
	ctx context.Context,
	transition *pluginBackendRestartTransition,
) error {
	if err := r.replaceRuntimeToolsLocked(transition.previousRuntime, transition.nextRuntime); err != nil {
		closePluginBackendRuntime(transition.nextRuntime)
		return err
	}
	if err := r.replaceLSPSpecsLocked(ctx, transition.previousLSPSpecs, transition.nextLSPSpecs); err != nil {
		r.logPluginBackendRuntimeError(
			"rollback plugin backend MCP tools after LSP refresh failure",
			r.replaceRuntimeToolsLocked(transition.nextRuntime, transition.previousRuntime),
		)
		closePluginBackendRuntime(transition.nextRuntime)
		return err
	}
	r.runtime = transition.nextRuntime
	return nil
}

func (r *pluginBackendRuntimeRefresher) commitRuntimeRefreshTransitionLocked(
	transition *pluginBackendRuntimeTransition,
) (plugins.DiscoverySnapshot, error) {
	committedSnapshot, commitErr := r.service.CommitBackendRuntimeRefresh()
	if commitErr != nil {
		r.rollbackRuntimeRefreshTransitionLocked(transition)
		return committedSnapshot, commitErr
	}
	closePluginBackendRuntime(transition.previousRuntime)
	return committedSnapshot, nil
}

func (r *pluginBackendRuntimeRefresher) commitRestartTransitionLocked(
	transition *pluginBackendRestartTransition,
) (plugins.DiscoverySnapshot, error) {
	committedSnapshot, commitErr := r.service.CommitBackendRuntimeRefresh()
	if commitErr != nil {
		r.rollbackRestartTransitionLocked(transition)
		return committedSnapshot, commitErr
	}

	r.lspSpecs = lsp.CloneLanguageServerSpecs(transition.nextLSPSpecs)
	closePluginBackendRuntime(transition.previousRuntime)
	return committedSnapshot, nil
}

func (r *pluginBackendRuntimeRefresher) rollbackRuntimeRefreshTransitionLocked(
	transition *pluginBackendRuntimeTransition,
) {
	r.logPluginBackendRuntimeError(
		"rollback plugin backend MCP tools failed",
		r.replaceRuntimeToolsLocked(transition.nextRuntime, transition.previousRuntime),
	)
	r.runtime = transition.previousRuntime
	closePluginBackendRuntime(transition.nextRuntime)
}

func (r *pluginBackendRuntimeRefresher) rollbackRestartTransitionLocked(
	transition *pluginBackendRestartTransition,
) {
	r.logPluginBackendRuntimeError(
		"rollback plugin backend MCP tools failed",
		r.replaceRuntimeToolsLocked(transition.nextRuntime, transition.previousRuntime),
	)
	r.logPluginBackendRuntimeError(
		"rollback plugin backend language servers failed",
		r.replaceLSPSpecsLocked(context.Background(), transition.nextLSPSpecs, transition.previousLSPSpecs),
	)
	r.runtime = transition.previousRuntime
	r.lspSpecs = transition.previousLSPSpecs
	closePluginBackendRuntime(transition.nextRuntime)
}

func (r *pluginBackendRuntimeRefresher) Close(ctx context.Context) error {
	if r == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.runtime == nil {
		return nil
	}
	runtime := r.runtime
	r.runtime = nil
	return runtime.Close(ctx)
}

func (r *pluginBackendRuntimeRefresher) SelectedLanguageServerStatuses(statusEntries []plugins.PluginStatusEntry) []plugins.SelectedLanguageServerStatus {
	if r == nil {
		return []plugins.SelectedLanguageServerStatus{}
	}

	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		r.logPluginBackendRuntimeError("load selected language server settings", err)
		return []plugins.SelectedLanguageServerStatus{}
	}

	r.mu.Lock()
	appliedSpecs := lsp.CloneLanguageServerSpecs(r.lspSpecs)
	r.mu.Unlock()

	previewStatusEntries, err := r.previewSelectedLanguageServerStatusEntries()
	if err != nil {
		r.logPluginBackendRuntimeError("preview selected language server statuses", err)
		previewStatusEntries = clonePluginStatusEntries(statusEntries)
	}

	return buildSelectedLanguageServerStatuses(
		selections,
		statusEntries,
		previewStatusEntries,
		appliedSpecs,
	)
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerSpecs(snapshot plugins.DiscoverySnapshot) ([]lsp.LanguageServerSpec, error) {
	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, err
	}
	return r.service.LanguageServerSpecsForSnapshot(snapshot, selections)
}

func (r *pluginBackendRuntimeRefresher) selectedLanguageServerPlugins() (map[string]*string, error) {
	if r == nil || r.settings == nil {
		return map[string]*string{}, nil
	}
	return settingsstate.LanguageServerSelectedByLanguage(r.settings.Snapshot().Document)
}

func cloneSelectedLanguageServerPlugins(selectedByLanguage map[string]*string) map[string]*string {
	if len(selectedByLanguage) == 0 {
		return map[string]*string{}
	}
	cloned := make(map[string]*string, len(selectedByLanguage))
	for languageID, selection := range selectedByLanguage {
		if selection == nil {
			cloned[languageID] = nil
			continue
		}
		pluginID := *selection
		cloned[languageID] = &pluginID
	}
	return cloned
}

func buildSelectedLanguageServerStatuses(
	selections map[string]*string,
	liveStatusEntries []plugins.PluginStatusEntry,
	previewStatusEntries []plugins.PluginStatusEntry,
	appliedSpecs []lsp.LanguageServerSpec,
) []plugins.SelectedLanguageServerStatus {
	languages := trackedLanguageServerLanguages(
		selections,
		liveStatusEntries,
		previewStatusEntries,
		appliedSpecs,
	)
	statuses := make([]plugins.SelectedLanguageServerStatus, 0, len(languages))
	for _, language := range languages {
		statuses = append(statuses, buildSelectedLanguageServerStatus(
			language,
			selections,
			previewStatusEntries,
			appliedSpecs,
		))
	}
	return statuses
}

func trackedLanguageServerLanguages(
	selections map[string]*string,
	liveStatusEntries []plugins.PluginStatusEntry,
	previewStatusEntries []plugins.PluginStatusEntry,
	appliedSpecs []lsp.LanguageServerSpec,
) []string {
	languages := map[string]struct{}{
		"python": {},
	}
	for language := range selections {
		normalized := normalizeTrackedLanguage(language)
		if normalized == "" {
			continue
		}
		languages[normalized] = struct{}{}
	}
	addTrackedLanguagesFromStatusEntries(languages, liveStatusEntries)
	addTrackedLanguagesFromStatusEntries(languages, previewStatusEntries)
	for _, spec := range appliedSpecs {
		normalized := normalizeTrackedLanguage(spec.LanguageID)
		if normalized == "" {
			continue
		}
		languages[normalized] = struct{}{}
	}

	ordered := make([]string, 0, len(languages))
	for language := range languages {
		ordered = append(ordered, language)
	}
	sort.Strings(ordered)
	return ordered
}

func buildSelectedLanguageServerStatus(
	language string,
	selections map[string]*string,
	previewStatusEntries []plugins.PluginStatusEntry,
	appliedSpecs []lsp.LanguageServerSpec,
) plugins.SelectedLanguageServerStatus {
	appliedPluginID, hasAppliedSpec := appliedLanguageServerPluginID(language, appliedSpecs)
	selectedPluginID, hasSelection := selections[language]
	if !hasSelection {
		return plugins.SelectedLanguageServerStatus{
			LanguageID: language,
			State:      plugins.SelectedLanguageServerStateNotSelected,
			Applied:    !hasAppliedSpec,
		}
	}
	if selectedPluginID == nil {
		return plugins.SelectedLanguageServerStatus{
			LanguageID: language,
			State:      plugins.SelectedLanguageServerStateDisabled,
			Applied:    !hasAppliedSpec,
		}
	}

	pluginID := strings.TrimSpace(*selectedPluginID)
	if pluginID == "" {
		return plugins.SelectedLanguageServerStatus{
			LanguageID: language,
			State:      plugins.SelectedLanguageServerStateNotSelected,
			Applied:    !hasAppliedSpec,
		}
	}

	selectedPlugin := &pluginID
	appliedMatchesSelection := hasAppliedSpec && appliedPluginID == pluginID
	selectedEntry, ok := primaryStatusEntryForPlugin(previewStatusEntries, pluginID)
	if !ok {
		return plugins.SelectedLanguageServerStatus{
			LanguageID:       language,
			SelectedPluginID: selectedPlugin,
			State:            plugins.SelectedLanguageServerStateSelectedPluginMissing,
			Applied:          appliedMatchesSelection,
		}
	}
	if selectedEntry.State != plugins.PluginRuntimeStateActive && selectedEntry.State != plugins.PluginRuntimeStatePendingRestart {
		return plugins.SelectedLanguageServerStatus{
			LanguageID:       language,
			SelectedPluginID: selectedPlugin,
			State:            plugins.SelectedLanguageServerStateSelectedPluginUnavailable,
			Applied:          appliedMatchesSelection,
		}
	}
	if !statusEntryProvidesLanguage(selectedEntry, language) {
		return plugins.SelectedLanguageServerStatus{
			LanguageID:       language,
			SelectedPluginID: selectedPlugin,
			State:            plugins.SelectedLanguageServerStateSelectedPluginWrongLang,
			Applied:          appliedMatchesSelection,
		}
	}

	return plugins.SelectedLanguageServerStatus{
		LanguageID:       language,
		SelectedPluginID: selectedPlugin,
		State:            plugins.SelectedLanguageServerStateReady,
		Applied:          appliedMatchesSelection,
	}
}

func addTrackedLanguagesFromStatusEntries(
	languages map[string]struct{},
	statusEntries []plugins.PluginStatusEntry,
) {
	for _, entry := range statusEntries {
		for _, registration := range entry.RegisteredLanguageServers {
			normalized := normalizeTrackedLanguage(registration.Language)
			if normalized == "" {
				continue
			}
			languages[normalized] = struct{}{}
		}
	}
}

func normalizeTrackedLanguage(language string) string {
	return strings.ToLower(strings.TrimSpace(language))
}

func appliedLanguageServerPluginID(language string, appliedSpecs []lsp.LanguageServerSpec) (string, bool) {
	normalizedLanguage := normalizeTrackedLanguage(language)
	for _, spec := range appliedSpecs {
		if normalizeTrackedLanguage(spec.LanguageID) != normalizedLanguage {
			continue
		}
		return strings.TrimSpace(spec.PluginID), true
	}
	return "", false
}

func primaryStatusEntryForPlugin(statusEntries []plugins.PluginStatusEntry, pluginID string) (plugins.PluginStatusEntry, bool) {
	for _, entry := range statusEntries {
		if strings.TrimSpace(entry.PluginID) != pluginID {
			continue
		}
		return entry, true
	}
	return plugins.PluginStatusEntry{}, false
}

func statusEntryProvidesLanguage(entry plugins.PluginStatusEntry, language string) bool {
	normalizedLanguage := normalizeTrackedLanguage(language)
	for _, registration := range entry.RegisteredLanguageServers {
		if normalizeTrackedLanguage(registration.Language) == normalizedLanguage {
			return true
		}
	}
	return false
}

func (r *pluginBackendRuntimeRefresher) previewSelectedLanguageServerStatusEntries() ([]plugins.PluginStatusEntry, error) {
	if r == nil || r.service == nil {
		return nil, nil
	}

	previewSnapshot, err := r.service.PreviewBackendRuntimeRefresh()
	if err != nil {
		return nil, err
	}
	return pluginStatusEntriesFromSnapshot(previewSnapshot), nil
}

func pluginStatusEntriesFromSnapshot(snapshot plugins.DiscoverySnapshot) []plugins.PluginStatusEntry {
	entries := make([]plugins.PluginStatusEntry, 0, len(snapshot.Plugins))
	for _, plugin := range snapshot.Plugins {
		entries = append(entries, plugins.PluginStatusEntry{
			PluginID: plugin.PluginID,
			State:    plugin.State,
			RegisteredLanguageServers: append(
				[]plugins.PluginRegisteredLanguageServer(nil),
				plugin.RegisteredLanguageServers...,
			),
		})
	}
	return entries
}

func clonePluginStatusEntries(entries []plugins.PluginStatusEntry) []plugins.PluginStatusEntry {
	if len(entries) == 0 {
		return nil
	}
	cloned := make([]plugins.PluginStatusEntry, 0, len(entries))
	for _, entry := range entries {
		cloned = append(cloned, plugins.PluginStatusEntry{
			PluginID: entry.PluginID,
			State:    entry.State,
			RegisteredLanguageServers: append(
				[]plugins.PluginRegisteredLanguageServer(nil),
				entry.RegisteredLanguageServers...,
			),
		})
	}
	return cloned
}

func (r *pluginBackendRuntimeRefresher) buildRuntimeLocked(ctx context.Context, snapshot plugins.DiscoverySnapshot) (*pluginBackendMCPRuntime, error) {
	return newPluginBackendMCPRuntime(ctx, pluginBackendMCPRuntimeOptions{
		Logger:      r.logger,
		RuntimeRoot: r.runtimeRoot,
		Snapshot:    snapshot,
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

func findPluginInScope(entries []plugins.DiscoveredPlugin, pluginID string, scope plugins.PluginScope) (plugins.DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry, true
		}
	}
	return plugins.DiscoveredPlugin{}, false
}

func findHighestPrecedencePlugin(entries []plugins.DiscoveredPlugin, pluginID string) (plugins.DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry, true
		}
	}
	return plugins.DiscoveredPlugin{}, false
}

func cloneOptionalDigest(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}

func closePluginBackendRuntime(runtime *pluginBackendMCPRuntime) {
	if runtime == nil {
		return
	}
	_ = runtime.Close(context.Background())
}

func restorePreviousProjectSession(restart func(context.Context) error, cause error) error {
	restoreCtx, cancel := context.WithTimeout(context.Background(), pluginBackendRestartRollbackTimeout)
	defer cancel()

	if restoreErr := restart(restoreCtx); restoreErr != nil {
		return errors.Join(cause, fmt.Errorf("restore previous language server session: %w", restoreErr))
	}
	return cause
}

func (r *pluginBackendRuntimeRefresher) ReapplyAppliedLanguageServerPluginConfig(ctx context.Context, pluginID string) error {
	if r == nil || r.service == nil {
		return nil
	}
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	previousSpecs, updatedSpecs, changed, err := r.prepareAppliedLanguageServerConfigUpdate(trimmedPluginID)
	if err != nil || !changed {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	return r.applyAppliedLanguageServerConfigUpdateLocked(ctx, previousSpecs, updatedSpecs)
}

func (r *pluginBackendRuntimeRefresher) prepareAppliedLanguageServerConfigUpdate(
	pluginID string,
) ([]lsp.LanguageServerSpec, []lsp.LanguageServerSpec, bool, error) {
	selections, err := r.selectedLanguageServerPlugins()
	if err != nil {
		return nil, nil, false, err
	}
	snapshot, err := r.service.Rescan()
	if err != nil {
		return nil, nil, false, err
	}
	nextSpecs, err := r.service.LanguageServerSpecsForSnapshot(snapshot, selections)
	if err != nil {
		return nil, nil, false, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	previousSpecs := lsp.CloneLanguageServerSpecs(r.lspSpecs)
	updatedSpecs, changed := updatedAppliedLanguageServerSpecsForPlugin(
		previousSpecs,
		nextSpecs,
		pluginID,
	)
	return previousSpecs, updatedSpecs, changed, nil
}

func (r *pluginBackendRuntimeRefresher) applyAppliedLanguageServerConfigUpdateLocked(
	ctx context.Context,
	previousSpecs []lsp.LanguageServerSpec,
	updatedSpecs []lsp.LanguageServerSpec,
) error {
	if err := r.replaceLSPSpecsLocked(ctx, previousSpecs, updatedSpecs); err != nil {
		return err
	}
	r.lspSpecs = lsp.CloneLanguageServerSpecs(updatedSpecs)
	if err := r.rematerializeCurrentProjectLocked(ctx); err != nil {
		return r.rollbackAppliedLanguageServerConfigUpdateLocked(err, previousSpecs, updatedSpecs)
	}
	return nil
}

func (r *pluginBackendRuntimeRefresher) rollbackAppliedLanguageServerConfigUpdateLocked(
	cause error,
	previousSpecs []lsp.LanguageServerSpec,
	updatedSpecs []lsp.LanguageServerSpec,
) error {
	restoreCtx, cancel := context.WithTimeout(context.Background(), pluginBackendRestartRollbackTimeout)
	defer cancel()

	if rollbackErr := r.replaceLSPSpecsLocked(restoreCtx, updatedSpecs, previousSpecs); rollbackErr != nil {
		return errors.Join(cause, fmt.Errorf("restore previous language server specs: %w", rollbackErr))
	}
	r.lspSpecs = previousSpecs
	if restoreErr := r.rematerializeCurrentProjectLocked(restoreCtx); restoreErr != nil {
		return errors.Join(cause, fmt.Errorf("restore previous language server session: %w", restoreErr))
	}
	return cause
}

func (r *pluginBackendRuntimeRefresher) rematerializeCurrentProjectLocked(ctx context.Context) error {
	if r == nil || r.projectState == nil || r.projectLSPSync == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return r.projectLSPSync.MaterializeDocument(ctx, r.projectState.Snapshot().Document)
}

func updatedAppliedLanguageServerSpecsForPlugin(
	currentSpecs []lsp.LanguageServerSpec,
	nextSpecs []lsp.LanguageServerSpec,
	pluginID string,
) ([]lsp.LanguageServerSpec, bool) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" || len(currentSpecs) == 0 || len(nextSpecs) == 0 {
		return nil, false
	}

	nextSpecsByLanguage := map[string]lsp.LanguageServerSpec{}
	for _, nextSpec := range nextSpecs {
		if strings.TrimSpace(nextSpec.PluginID) != trimmedPluginID {
			continue
		}
		nextSpecsByLanguage[normalizeTrackedLanguage(nextSpec.LanguageID)] = nextSpec
	}
	if len(nextSpecsByLanguage) == 0 {
		return nil, false
	}

	updatedSpecs := lsp.CloneLanguageServerSpecs(currentSpecs)
	changed := false
	for index, currentSpec := range currentSpecs {
		if strings.TrimSpace(currentSpec.PluginID) != trimmedPluginID {
			continue
		}

		nextSpec, ok := nextSpecsByLanguage[normalizeTrackedLanguage(currentSpec.LanguageID)]
		if !ok {
			continue
		}
		if reflect.DeepEqual(currentSpec, nextSpec) {
			continue
		}
		updatedSpecs[index] = nextSpec
		changed = true
	}
	return updatedSpecs, changed
}
