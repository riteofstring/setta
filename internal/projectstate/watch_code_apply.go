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
	projectID string,
	sourcePath string,
	raw string,
	baselineOnly bool,
	movedFrom string,
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

	didUpdate, err := project.ApplyWatchCodeFileUpdate(sourcePath, raw, baselineOnly, movedFrom, workspaceRoot)
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
) (Snapshot, bool, error) {
	if r == nil {
		return Snapshot{}, false, ErrRuntimeClosed
	}

	return r.mutateAndSaveIfUpdated(ctx, func(document Document) (Document, bool, error) {
		didUpdate, err := document.ApplyWatchCodeFileUpdate(projectID, sourcePath, raw, baselineOnly, movedFrom, workspaceRoot)
		return document, didUpdate, err
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
		return document, didUpdate, err
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
	sourcePath string,
	raw string,
	baselineOnly bool,
	movedFrom string,
	workspaceRoot string,
) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}

	normalizedSourcePath, ok, err := resolveWatchCodeActivePath(workspaceRoot, sourcePath, "watch code source path")
	if err != nil || !ok {
		return false, err
	}
	if !p.watchCodePathMatches(workspaceRoot, normalizedSourcePath) {
		return false, nil
	}
	if !baselineOnly && !p.WatchCodeEnabled {
		return false, nil
	}

	relativeSourcePath, err := watchCodeRelativePath(workspaceRoot, normalizedSourcePath)
	if err != nil {
		return false, err
	}
	callables, parsed, err := watchcode.ParsePythonCallables(raw, relativeSourcePath)
	if err != nil {
		return false, err
	}

	didUpdate := false
	if trimmedMovedFrom := strings.TrimSpace(movedFrom); trimmedMovedFrom != "" {
		normalizedMovedFrom, movedFromOK, err := resolveWatchCodeActivePath(workspaceRoot, trimmedMovedFrom, "watch code moved-from path")
		if err != nil {
			return false, err
		}
		if movedFromOK {
			movePlan := watchcode.PlanMoveUpdate(
				normalizedMovedFrom,
				normalizedSourcePath,
				callables,
				parsed,
				projectWatchCodeRegistryPlanView(p.WatchCodeRegistry),
				cloneStringSliceMap(p.WatchCodeBaselineByPath),
			)
			if p.applyWatchCodeMovePlan(movePlan) {
				didUpdate = true
			}
		}
	}

	if !parsed {
		return didUpdate, nil
	}
	if baselineOnly {
		if p.setWatchCodeBaseline(normalizedSourcePath, watchcode.IdentityList(callables)) {
			didUpdate = true
		}
		return didUpdate, nil
	}
	if !p.HasPythonCodegenTarget() {
		return didUpdate, nil
	}

	scanPlan := watchcode.PlanScanUpdate(
		normalizedSourcePath,
		callables,
		projectWatchCodeRegistryPlanView(p.WatchCodeRegistry),
		cloneStringSliceMap(p.WatchCodeBaselineByPath),
	)
	if p.applyWatchCodeScanPlan(scanPlan) {
		didUpdate = true
	}
	return didUpdate, nil
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
	return p.applyWatchCodeDeletePlan(deletePlan), nil
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
	relativePath, err := watchCodeRelativePath(workspaceRoot, absolutePath)
	if err != nil {
		return false
	}
	normalizedRelativePath := path.Clean(strings.TrimSpace(relativePath))
	if normalizedRelativePath == "." || normalizedRelativePath == "" {
		return false
	}

	for _, filePath := range p.WatchCodeFiles {
		if path.Clean(strings.TrimSpace(filePath)) == normalizedRelativePath {
			return true
		}
	}
	relativeDir := path.Dir(normalizedRelativePath)
	for _, folder := range p.WatchCodeFolders {
		folderPath := path.Clean(strings.TrimSpace(folder.Path))
		if folderPath == "" {
			continue
		}
		if folderPath == "." {
			if folder.Recursive || relativeDir == "." {
				return true
			}
			continue
		}
		if folder.Recursive {
			if normalizedRelativePath == folderPath || strings.HasPrefix(normalizedRelativePath, folderPath+"/") {
				return true
			}
			continue
		}
		if relativeDir == folderPath {
			return true
		}
	}
	return false
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

func (p *Project) applyWatchCodeScanPlan(plan watchcode.ScanPlan) bool {
	didUpdate := false

	if _, ok := p.WatchCodeBaselineByPath[plan.SourcePath]; ok {
		if p.setWatchCodeBaseline(plan.SourcePath, plan.PrunedBaseline) {
			didUpdate = true
		}
	}
	for _, rename := range plan.Renames {
		entry, ok := p.WatchCodeRegistry[rename.OldIdentity]
		if !ok {
			continue
		}
		delete(p.WatchCodeRegistry, rename.OldIdentity)
		entry.Kind = fromWatchcodeCallableKind(rename.NewCallable.Kind)
		entry.SignatureHash = rename.NewCallable.SignatureHash
		entry.BodyHash = rename.NewCallable.BodyHash
		entry.SourcePath = plan.SourcePath
		p.WatchCodeRegistry[rename.NewCallable.Identity] = entry
		didUpdate = true
	}
	for _, identity := range plan.RemovedIdentities {
		if _, ok := p.WatchCodeRegistry[identity]; !ok {
			continue
		}
		delete(p.WatchCodeRegistry, identity)
		didUpdate = true
	}
	for _, metadataChange := range plan.MetadataChanges {
		if p.applyWatchCodeMetadataChange(metadataChange.Identity, metadataChange.Callable, plan.SourcePath) {
			didUpdate = true
		}
	}
	for _, signatureChange := range plan.SignatureChanges {
		if p.applyWatchCodeMetadataChange(signatureChange.Identity, signatureChange.Callable, plan.SourcePath) {
			didUpdate = true
		}
	}
	for _, addition := range plan.Additions {
		if _, ok := p.WatchCodeRegistry[addition.Identity]; ok {
			continue
		}
		p.WatchCodeRegistry[addition.Identity] = WatchCodeRegistryEntry{
			CallableName:  addition.CanonicalName,
			Kind:          fromWatchcodeCallableKind(addition.Kind),
			SignatureHash: addition.SignatureHash,
			BodyHash:      addition.BodyHash,
			SourcePath:    plan.SourcePath,
			SectionIDs:    []string{},
			SectionsCount: 0,
		}
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

func (p *Project) applyWatchCodeDeletePlan(plan watchcode.DeletePlan) bool {
	didUpdate := false
	for _, identity := range plan.RemovedIdentities {
		if _, ok := p.WatchCodeRegistry[identity]; !ok {
			continue
		}
		delete(p.WatchCodeRegistry, identity)
		didUpdate = true
	}
	if plan.RemoveBaselinePath {
		if _, ok := p.WatchCodeBaselineByPath[plan.SourcePath]; ok {
			delete(p.WatchCodeBaselineByPath, plan.SourcePath)
			didUpdate = true
		}
	}
	return didUpdate
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
