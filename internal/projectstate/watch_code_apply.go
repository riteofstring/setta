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

	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return false, ErrProjectIDRequired
	}
	project, ok := d.Projects[trimmedProjectID]
	if !ok {
		return false, nil
	}

	didUpdate, err := project.ApplyWatchCodeFileUpdate(ctx, sourcePath, raw, baselineOnly, movedFrom, workspaceRoot, resolver)
	if err != nil {
		return false, err
	}
	if didUpdate {
		d.Projects[trimmedProjectID] = project
	}
	return didUpdate, nil
}

func (d *Document) ApplyWatchCodeFileDelete(
	projectID string,
	sourcePath string,
	workspaceRoot string,
) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}

	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return false, ErrProjectIDRequired
	}
	project, ok := d.Projects[trimmedProjectID]
	if !ok {
		return false, nil
	}

	didUpdate, err := project.ApplyWatchCodeFileDelete(sourcePath, workspaceRoot)
	if err != nil {
		return false, err
	}
	if didUpdate {
		d.Projects[trimmedProjectID] = project
	}
	return didUpdate, nil
}

func (r *Runtime) ApplyWatchCodeFileUpdate(
	ctx context.Context,
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
		didUpdate, err := document.ApplyWatchCodeFileUpdate(ctx, projectID, sourcePath, raw, baselineOnly, movedFrom, workspaceRoot, resolver)
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
	projectID string,
	sourcePath string,
	workspaceRoot string,
) (Snapshot, bool, error) {
	if r == nil {
		return Snapshot{}, false, ErrRuntimeClosed
	}

	return r.mutateAndSaveIfUpdated(ctx, func(document Document) (Document, bool, error) {
		didUpdate, err := document.ApplyWatchCodeFileDelete(projectID, sourcePath, workspaceRoot)
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

	update, ok, err := p.prepareWatchCodeFileUpdate(workspaceRoot, sourcePath, raw, baselineOnly)
	if err != nil || !ok {
		return false, err
	}

	didUpdate, err := p.applyWatchCodeMovedFileUpdate(workspaceRoot, movedFrom, update)
	if err != nil {
		return false, err
	}
	return p.applyParsedWatchCodeFileUpdate(ctx, update, baselineOnly, didUpdate, resolver)
}

type watchCodeFileUpdate struct {
	sourcePath string
	callables  []watchcode.CallableInfo
	parsed     bool
}

func (p *Project) prepareWatchCodeFileUpdate(
	workspaceRoot string,
	sourcePath string,
	raw string,
	baselineOnly bool,
) (watchCodeFileUpdate, bool, error) {
	normalizedSourcePath, ok, err := resolveWatchCodeActivePath(workspaceRoot, sourcePath, "watch code source path")
	if err != nil || !ok {
		return watchCodeFileUpdate{}, false, err
	}
	if !p.watchCodePathMatches(workspaceRoot, normalizedSourcePath) {
		return watchCodeFileUpdate{}, false, nil
	}
	if !baselineOnly && !p.WatchCodeEnabled {
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
		projectWatchCodeRegistryPlanView(p.WatchCodeRegistry),
		cloneStringSliceMap(p.WatchCodeBaselineByPath),
	)
	return p.applyWatchCodeMovePlan(movePlan), nil
}

func (p *Project) applyParsedWatchCodeFileUpdate(
	ctx context.Context,
	update watchCodeFileUpdate,
	baselineOnly bool,
	didUpdate bool,
	resolver CallableSignatureResolver,
) (bool, error) {
	if !update.parsed {
		return didUpdate, nil
	}
	if baselineOnly {
		return didUpdate || p.setWatchCodeBaseline(update.sourcePath, watchcode.IdentityList(update.callables)), nil
	}
	if !p.HasPythonCodegenTarget() {
		return didUpdate, nil
	}

	scanPlan := watchcode.PlanScanUpdate(
		update.sourcePath,
		update.callables,
		projectWatchCodeRegistryPlanView(p.WatchCodeRegistry),
		cloneStringSliceMap(p.WatchCodeBaselineByPath),
	)
	updated, err := p.applyWatchCodeScanPlan(ctx, scanPlan, resolver)
	if err != nil {
		return false, err
	}
	return didUpdate || updated, nil
}

func (p *Project) ApplyWatchCodeFileDelete(
	sourcePath string,
	workspaceRoot string,
) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}

	normalizedSourcePath, ok, err := resolveWatchCodeActivePath(workspaceRoot, sourcePath, "watch code source path")
	if err != nil || !ok {
		return false, err
	}
	if !p.WatchCodeEnabled || !p.HasPythonCodegenTarget() {
		return false, nil
	}
	if !p.watchCodePathMatches(workspaceRoot, normalizedSourcePath) {
		return false, nil
	}

	deletePlan := watchcode.PlanDeleteUpdate(
		normalizedSourcePath,
		projectWatchCodeRegistryPlanView(p.WatchCodeRegistry),
		cloneStringSliceMap(p.WatchCodeBaselineByPath),
	)
	return p.applyWatchCodeDeletePlan(deletePlan)
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

func (p *Project) watchCodePathMatches(workspaceRoot string, absolutePath string) bool {
	normalizedRelativePath, relativeDir, ok := normalizeWatchCodeMatchedRelativePath(workspaceRoot, absolutePath)
	if !ok {
		return false
	}

	for _, filePath := range p.WatchCodeFiles {
		if path.Clean(strings.TrimSpace(filePath)) == normalizedRelativePath {
			return true
		}
	}
	for _, folder := range p.WatchCodeFolders {
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

func (p *Project) applyWatchCodeMovePlan(plan watchcode.MovePlan) bool {
	if !plan.Tracked {
		return false
	}

	didUpdate := false
	if plan.RemoveSourceBaseline {
		if _, ok := p.WatchCodeBaselineByPath[plan.SourcePath]; ok {
			delete(p.WatchCodeBaselineByPath, plan.SourcePath)
			didUpdate = true
		}
	}
	if plan.DestinationBaseline != nil && p.setWatchCodeBaseline(plan.DestinationPath, plan.DestinationBaseline) {
		didUpdate = true
	}
	for _, identity := range plan.MovedRegistryIdentities {
		entry, ok := p.WatchCodeRegistry[identity]
		if !ok || strings.TrimSpace(entry.SourcePath) == plan.DestinationPath {
			continue
		}
		entry.SourcePath = plan.DestinationPath
		p.WatchCodeRegistry[identity] = entry
		didUpdate = true
	}
	return didUpdate
}

func (p *Project) applyWatchCodeMetadataChange(identity string, callable watchcode.CallableInfo, sourcePath string) bool {
	entry, ok := p.WatchCodeRegistry[identity]
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
	p.WatchCodeRegistry[identity] = entry
	return true
}

func (p *Project) setWatchCodeBaseline(sourcePath string, identities []string) bool {
	if p.WatchCodeBaselineByPath == nil {
		p.WatchCodeBaselineByPath = map[string][]string{}
	}
	cloned := append([]string(nil), identities...)
	current, ok := p.WatchCodeBaselineByPath[sourcePath]
	if ok && reflect.DeepEqual(current, cloned) {
		return false
	}
	p.WatchCodeBaselineByPath[sourcePath] = cloned
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
