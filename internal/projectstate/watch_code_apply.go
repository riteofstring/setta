package projectstate

import (
	"context"
	"path"
	"reflect"
	"strings"

	"setta/internal/statefs"
	"setta/internal/watchcode"
)

func (d *Document) ApplyWatchCodeFileUpdate(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	sourcePath string,
	raw string,
	baselineOnly bool,
	movedFrom string,
	workspaceRoot string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return false, err
	}

	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return false, ErrProjectIDRequired
	}
	project, ok := d.Projects[trimmedProjectID]
	if !ok {
		return false, nil
	}

	data, existed, err := d.decodeWatchCodePluginData(pluginID)
	if err != nil {
		return false, err
	}
	projectData, _ := data.projectData(project.ID)
	didUpdate, err := project.ApplyWatchCodeFileUpdate(ctx, &projectData, sourcePath, raw, baselineOnly, movedFrom, workspaceRoot, resolver)
	if err != nil {
		return false, err
	}
	if didUpdate {
		d.Projects[trimmedProjectID] = project
		data = data.withProjectData(project.ID, projectData, existed)
		if err := d.setWatchCodePluginData(pluginID, data, existed); err != nil {
			return false, err
		}
	}
	return didUpdate, nil
}

func (d *Document) ApplyWatchCodeFileDelete(
	providerPluginID string,
	projectID string,
	sourcePath string,
	workspaceRoot string,
) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return false, err
	}

	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return false, ErrProjectIDRequired
	}
	project, ok := d.Projects[trimmedProjectID]
	if !ok {
		return false, nil
	}

	data, existed, err := d.decodeWatchCodePluginData(pluginID)
	if err != nil {
		return false, err
	}
	projectData, _ := data.projectData(project.ID)
	didUpdate, err := project.ApplyWatchCodeFileDelete(&projectData, sourcePath, workspaceRoot)
	if err != nil {
		return false, err
	}
	if didUpdate {
		d.Projects[trimmedProjectID] = project
		data = data.withProjectData(project.ID, projectData, existed)
		if err := d.setWatchCodePluginData(pluginID, data, existed); err != nil {
			return false, err
		}
	}
	return didUpdate, nil
}

func (r *Runtime) ApplyWatchCodeFileUpdate(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	sourcePath string,
	raw string,
	baselineOnly bool,
	movedFrom string,
	workspaceRoot string,
	resolver CallableSignatureResolver,
) (Snapshot, bool, error) {
	if r == nil {
		return Snapshot{}, false, ErrRuntimeClosed
	}

	return r.mutateAndSaveIfUpdated(ctx, func(document Document) (Document, bool, error) {
		didUpdate, err := document.ApplyWatchCodeFileUpdate(ctx, providerPluginID, projectID, sourcePath, raw, baselineOnly, movedFrom, workspaceRoot, resolver)
		if err != nil || !didUpdate || baselineOnly {
			return document, didUpdate, err
		}
		if err := r.reconcileProjectPythonGeneratedSectionsAfterProjectMutation(ctx, &document, projectID); err != nil {
			return document, didUpdate, err
		}
		return document, didUpdate, nil
	})
}

func (r *Runtime) ApplyWatchCodeFileDelete(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	sourcePath string,
	workspaceRoot string,
) (Snapshot, bool, error) {
	if r == nil {
		return Snapshot{}, false, ErrRuntimeClosed
	}

	return r.mutateAndSaveIfUpdated(ctx, func(document Document) (Document, bool, error) {
		didUpdate, err := document.ApplyWatchCodeFileDelete(providerPluginID, projectID, sourcePath, workspaceRoot)
		if err != nil || !didUpdate {
			return document, didUpdate, err
		}
		if err := r.reconcileProjectPythonGeneratedSectionsAfterProjectMutation(ctx, &document, projectID); err != nil {
			return document, didUpdate, err
		}
		return document, didUpdate, nil
	})
}

func (r *Runtime) mutateAndSaveIfUpdated(
	ctx context.Context,
	mutate func(Document) (Document, bool, error),
) (Snapshot, bool, error) {
	if mutate == nil {
		return Snapshot{}, false, ErrMutationMissing
	}

	var didUpdate bool
	snapshot, err := r.submit(operation{
		run: func(state *runtimeState) (Snapshot, error) {
			nextDocument, updated, err := mutate(state.current.Clone())
			didUpdate = updated
			if err != nil {
				return snapshotFromState(*state), err
			}
			if !updated {
				return snapshotFromState(*state), nil
			}

			normalized, err := nextDocument.Normalized()
			if err != nil {
				return snapshotFromState(*state), err
			}

			if !reflect.DeepEqual(state.current, normalized) {
				state.current = normalized.Clone()
				state.revision++
			}

			snapshot := snapshotFromState(*state)
			return snapshot, r.persistSnapshot(ctx, snapshot)
		},
	})
	if err != nil {
		return Snapshot{}, false, err
	}
	return snapshot, didUpdate, nil
}

func (p *Project) ApplyWatchCodeFileUpdate(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	raw string,
	baselineOnly bool,
	movedFrom string,
	workspaceRoot string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if projectData == nil {
		return false, ErrWatchCodeProjectDataRequired
	}
	*projectData = projectData.Normalized()

	update, ok, err := p.prepareWatchCodeFileUpdate(projectData, workspaceRoot, sourcePath, raw, baselineOnly)
	if err != nil || !ok {
		return false, err
	}

	didUpdate, err := p.applyWatchCodeMovedFileUpdate(projectData, workspaceRoot, movedFrom, update)
	if err != nil {
		return false, err
	}
	return p.applyParsedWatchCodeFileUpdate(ctx, projectData, update, baselineOnly, didUpdate, resolver)
}

type watchCodeFileUpdate struct {
	sourcePath string
	callables  []watchcode.CallableInfo
	parsed     bool
}

func (p *Project) prepareWatchCodeFileUpdate(
	projectData *WatchCodePluginProjectData,
	workspaceRoot string,
	sourcePath string,
	raw string,
	baselineOnly bool,
) (watchCodeFileUpdate, bool, error) {
	normalizedSourcePath, ok, err := resolveWatchCodeActivePath(workspaceRoot, sourcePath, "watch code source path")
	if err != nil || !ok {
		return watchCodeFileUpdate{}, false, err
	}
	if !watchCodePathMatches(*projectData, workspaceRoot, normalizedSourcePath) {
		return watchCodeFileUpdate{}, false, nil
	}
	if !baselineOnly && !projectData.Enabled {
		return watchCodeFileUpdate{}, false, nil
	}

	relativeSourcePath, err := watchCodeRelativePath(workspaceRoot, normalizedSourcePath)
	if err != nil {
		return watchCodeFileUpdate{}, false, err
	}
	callables, parsed, err := watchcode.ParsePythonCallables(raw, relativeSourcePath)
	if err != nil {
		return watchCodeFileUpdate{}, false, err
	}

	return watchCodeFileUpdate{
		sourcePath: normalizedSourcePath,
		callables:  callables,
		parsed:     parsed,
	}, true, nil
}

func (p *Project) applyWatchCodeMovedFileUpdate(
	projectData *WatchCodePluginProjectData,
	workspaceRoot string,
	movedFrom string,
	update watchCodeFileUpdate,
) (bool, error) {
	trimmedMovedFrom := strings.TrimSpace(movedFrom)
	if trimmedMovedFrom == "" {
		return false, nil
	}

	normalizedMovedFrom, ok, err := resolveWatchCodeActivePath(workspaceRoot, trimmedMovedFrom, "watch code moved-from path")
	if err != nil || !ok {
		return false, err
	}

	movePlan := watchcode.PlanMoveUpdate(
		normalizedMovedFrom,
		update.sourcePath,
		update.callables,
		update.parsed,
		projectWatchCodeRegistryPlanView(projectData.Registry),
		cloneStringSliceMap(projectData.BaselineByPath),
	)
	return applyWatchCodeMovePlan(projectData, movePlan), nil
}

func (p *Project) applyParsedWatchCodeFileUpdate(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	update watchCodeFileUpdate,
	baselineOnly bool,
	didUpdate bool,
	resolver CallableSignatureResolver,
) (bool, error) {
	if !update.parsed {
		return didUpdate, nil
	}
	if baselineOnly {
		return didUpdate || setWatchCodeBaseline(projectData, update.sourcePath, watchcode.IdentityList(update.callables)), nil
	}
	if !p.HasPythonCodegenTarget() {
		return didUpdate, nil
	}

	scanPlan := watchcode.PlanScanUpdate(
		update.sourcePath,
		update.callables,
		projectWatchCodeRegistryPlanView(projectData.Registry),
		cloneStringSliceMap(projectData.BaselineByPath),
	)
	updated, err := p.applyWatchCodeScanPlan(ctx, projectData, scanPlan, resolver)
	if err != nil {
		return false, err
	}
	return didUpdate || updated, nil
}

func (p *Project) ApplyWatchCodeFileDelete(
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	workspaceRoot string,
) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}
	if projectData == nil {
		return false, ErrWatchCodeProjectDataRequired
	}
	*projectData = projectData.Normalized()

	normalizedSourcePath, ok, err := resolveWatchCodeActivePath(workspaceRoot, sourcePath, "watch code source path")
	if err != nil || !ok {
		return false, err
	}
	if !projectData.Enabled || !p.HasPythonCodegenTarget() {
		return false, nil
	}
	if !watchCodePathMatches(*projectData, workspaceRoot, normalizedSourcePath) {
		return false, nil
	}

	deletePlan := watchcode.PlanDeleteUpdate(
		normalizedSourcePath,
		projectWatchCodeRegistryPlanView(projectData.Registry),
		cloneStringSliceMap(projectData.BaselineByPath),
	)
	return p.applyWatchCodeDeletePlan(projectData, deletePlan)
}

func resolveWatchCodeActivePath(workspaceRoot string, raw string, label string) (string, bool, error) {
	if err := requireWatchCodeWorkspaceRoot(workspaceRoot); err != nil {
		return "", false, err
	}
	if strings.TrimSpace(raw) == "" {
		return "", false, nil
	}
	resolved, err := statefs.ResolveWithinRoot(workspaceRoot, raw, label)
	if err != nil {
		return "", false, err
	}
	return resolved, true, nil
}

func watchCodePathMatches(projectData WatchCodePluginProjectData, workspaceRoot string, absolutePath string) bool {
	normalizedRelativePath, relativeDir, ok := normalizeWatchCodeMatchedRelativePath(workspaceRoot, absolutePath)
	if !ok {
		return false
	}

	normalized := projectData.Normalized()
	for _, filePath := range normalized.Files {
		if path.Clean(strings.TrimSpace(filePath)) == normalizedRelativePath {
			return true
		}
	}
	for _, folder := range normalized.Folders {
		if watchCodeFolderMatchesPath(folder, normalizedRelativePath, relativeDir) {
			return true
		}
	}
	return false
}

func normalizeWatchCodeMatchedRelativePath(workspaceRoot string, absolutePath string) (string, string, bool) {
	relativePath, err := watchCodeRelativePath(workspaceRoot, absolutePath)
	if err != nil {
		return "", "", false
	}
	normalizedRelativePath := path.Clean(strings.TrimSpace(relativePath))
	if normalizedRelativePath == "." || normalizedRelativePath == "" {
		return "", "", false
	}
	return normalizedRelativePath, path.Dir(normalizedRelativePath), true
}

func watchCodeFolderMatchesPath(folder WatchCodeFolder, normalizedRelativePath string, relativeDir string) bool {
	folderPath := path.Clean(strings.TrimSpace(folder.Path))
	switch {
	case folderPath == "":
		return false
	case folderPath == ".":
		return folder.Recursive || relativeDir == "."
	case folder.Recursive:
		return normalizedRelativePath == folderPath || strings.HasPrefix(normalizedRelativePath, folderPath+"/")
	default:
		return relativeDir == folderPath
	}
}

func projectWatchCodeRegistryPlanView(registry map[string]WatchCodeRegistryEntry) map[string]watchcode.RegistryEntry {
	output := make(map[string]watchcode.RegistryEntry, len(registry))
	for identity, entry := range registry {
		output[identity] = watchcode.RegistryEntry{
			CallableName:  strings.TrimSpace(entry.CallableName),
			Kind:          toWatchcodeCallableKind(entry.Kind),
			SignatureHash: strings.TrimSpace(entry.SignatureHash),
			BodyHash:      strings.TrimSpace(entry.BodyHash),
			SourcePath:    strings.TrimSpace(entry.SourcePath),
			SectionIDs:    append([]string(nil), entry.SectionIDs...),
			SectionsCount: entry.SectionsCount,
		}
	}
	return output
}

func applyWatchCodeMovePlan(projectData *WatchCodePluginProjectData, plan watchcode.MovePlan) bool {
	if !plan.Tracked {
		return false
	}

	didUpdate := false
	if plan.RemoveSourceBaseline {
		if _, ok := projectData.BaselineByPath[plan.SourcePath]; ok {
			delete(projectData.BaselineByPath, plan.SourcePath)
			didUpdate = true
		}
	}
	if plan.DestinationBaseline != nil && setWatchCodeBaseline(projectData, plan.DestinationPath, plan.DestinationBaseline) {
		didUpdate = true
	}
	for _, identity := range plan.MovedRegistryIdentities {
		entry, ok := projectData.Registry[identity]
		if !ok || strings.TrimSpace(entry.SourcePath) == plan.DestinationPath {
			continue
		}
		entry.SourcePath = plan.DestinationPath
		projectData.Registry[identity] = entry
		didUpdate = true
	}
	return didUpdate
}

func applyWatchCodeMetadataChange(
	projectData *WatchCodePluginProjectData,
	identity string,
	callable watchcode.CallableInfo,
	sourcePath string,
) bool {
	entry, ok := projectData.Registry[identity]
	if !ok {
		return false
	}

	updated := false
	nextKind := fromWatchcodeCallableKind(callable.Kind)
	if entry.Kind != nextKind {
		entry.Kind = nextKind
		updated = true
	}
	if entry.SignatureHash != callable.SignatureHash {
		entry.SignatureHash = callable.SignatureHash
		updated = true
	}
	if entry.BodyHash != callable.BodyHash {
		entry.BodyHash = callable.BodyHash
		updated = true
	}
	if strings.TrimSpace(entry.SourcePath) != sourcePath {
		entry.SourcePath = sourcePath
		updated = true
	}
	if !updated {
		return false
	}
	projectData.Registry[identity] = entry
	return true
}

func setWatchCodeBaseline(projectData *WatchCodePluginProjectData, sourcePath string, identities []string) bool {
	if projectData.BaselineByPath == nil {
		projectData.BaselineByPath = map[string][]string{}
	}
	cloned := append([]string(nil), identities...)
	current, ok := projectData.BaselineByPath[sourcePath]
	if ok && reflect.DeepEqual(current, cloned) {
		return false
	}
	projectData.BaselineByPath[sourcePath] = cloned
	return true
}

func fromWatchcodeCallableKind(kind watchcode.CallableKind) WatchCodeCallableKind {
	switch kind {
	case watchcode.CallableKindAsyncFunction:
		return WatchCodeCallableKindAsyncFunction
	case watchcode.CallableKindClassInit:
		return WatchCodeCallableKindClassInit
	default:
		return WatchCodeCallableKindFunction
	}
}

func toWatchcodeCallableKind(kind WatchCodeCallableKind) watchcode.CallableKind {
	switch kind {
	case WatchCodeCallableKindAsyncFunction:
		return watchcode.CallableKindAsyncFunction
	case WatchCodeCallableKindClassInit:
		return watchcode.CallableKindClassInit
	default:
		return watchcode.CallableKindFunction
	}
}
