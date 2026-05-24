package projectstate

import (
	"context"
	"sort"

	"setta/internal/watchcode"
)

func (p *Project) applyWatchCodeScanPlanWithParsedSignatures(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	plan watchcode.ScanPlan,
	resolver CallableSignatureResolver,
	parsedSignatures map[string]CallableSignatureResult,
) (bool, error) {
	state := newWatchCodeScanPlanState()
	state.markUpdated(applyWatchCodePrunedBaseline(projectData, plan.SourcePath, plan.PrunedBaseline))

	if err := p.applyWatchCodeRenamePlans(projectData, plan.SourcePath, plan.Renames, state); err != nil {
		return false, err
	}

	updated, err := p.removeWatchCodeIdentities(projectData, plan.RemovedIdentities)
	if err != nil {
		return false, err
	}
	state.markUpdated(updated)

	if err := p.applyWatchCodeMetadataChanges(projectData, plan.SourcePath, plan.MetadataChanges, state); err != nil {
		return false, err
	}
	if err := p.applyWatchCodeSignatureChanges(projectData, plan.SourcePath, plan.SignatureChanges, state); err != nil {
		return false, err
	}

	state.markUpdated(applyWatchCodeAdditions(projectData, plan.SourcePath, plan.Additions, state))

	if err := p.applyWatchCodeParsedSignatureReconciliations(projectData, parsedSignatures, state); err != nil {
		return false, err
	}

	updated, err = p.ensurePendingWatchCodeCallableSections(
		ctx,
		projectData,
		state.pendingByIdentity,
		resolver,
		parsedSignatures,
	)
	if err != nil {
		return false, err
	}
	state.markUpdated(updated)

	updated, err = p.refetchPendingWatchCodeCallableSections(
		ctx,
		projectData,
		state.signatureRefetchByIdentity,
		resolver,
		parsedSignatures,
	)
	if err != nil {
		return false, err
	}
	state.markUpdated(updated)

	return state.didUpdate, nil
}

type watchCodeScanPlanState struct {
	didUpdate                  bool
	pendingByIdentity          map[string]watchcode.CallableInfo
	signatureRefetchByIdentity map[string]watchcode.CallableInfo
}

func newWatchCodeScanPlanState() *watchCodeScanPlanState {
	return &watchCodeScanPlanState{
		pendingByIdentity:          map[string]watchcode.CallableInfo{},
		signatureRefetchByIdentity: map[string]watchcode.CallableInfo{},
	}
}

func (s *watchCodeScanPlanState) markUpdated(updated bool) {
	if updated {
		s.didUpdate = true
	}
}

func (s *watchCodeScanPlanState) trackPending(identity string, callable watchcode.CallableInfo) {
	s.pendingByIdentity[identity] = callable
}

func (s *watchCodeScanPlanState) trackSignatureRefetch(identity string, callable watchcode.CallableInfo) {
	s.signatureRefetchByIdentity[identity] = callable
}

func applyWatchCodePrunedBaseline(projectData *WatchCodePluginProjectData, sourcePath string, prunedBaseline []string) bool {
	if _, ok := projectData.BaselineByPath[sourcePath]; !ok {
		return false
	}
	return setWatchCodeBaseline(projectData, sourcePath, prunedBaseline)
}

func (p *Project) applyWatchCodeRenamePlans(
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	renames []watchcode.RenamePlan,
	state *watchCodeScanPlanState,
) error {
	for _, rename := range renames {
		updated, pending, err := p.applyWatchCodeRename(projectData, rename, sourcePath)
		if err != nil {
			return err
		}
		state.markUpdated(updated)
		if pending {
			state.trackPending(rename.NewCallable.Identity, rename.NewCallable)
		}
	}
	return nil
}

func (p *Project) removeWatchCodeIdentities(
	projectData *WatchCodePluginProjectData,
	identities []string,
) (bool, error) {
	didUpdate := false
	for _, identity := range identities {
		updated, err := p.removeWatchCodeIdentity(projectData, identity)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) applyWatchCodeMetadataChanges(
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	changes []watchcode.MetadataChangePlan,
	state *watchCodeScanPlanState,
) error {
	for _, change := range changes {
		if err := p.applyWatchCodeTrackedCallableChange(
			projectData,
			sourcePath,
			change.Identity,
			change.Callable,
			false,
			state,
		); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) applyWatchCodeSignatureChanges(
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	changes []watchcode.SignatureChangePlan,
	state *watchCodeScanPlanState,
) error {
	for _, change := range changes {
		if err := p.applyWatchCodeTrackedCallableChange(
			projectData,
			sourcePath,
			change.Identity,
			change.Callable,
			true,
			state,
		); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) applyWatchCodeTrackedCallableChange(
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	identity string,
	callable watchcode.CallableInfo,
	shouldRefetch bool,
	state *watchCodeScanPlanState,
) error {
	state.markUpdated(applyWatchCodeMetadataChange(projectData, identity, callable, sourcePath))
	if shouldRefetch {
		state.trackSignatureRefetch(identity, callable)
	}

	pending, err := p.watchCodeEntryNeedsSection(projectData, identity)
	if err != nil {
		return err
	}
	if pending {
		state.trackPending(identity, callable)
	}
	return nil
}

func (p *Project) applyWatchCodeParsedSignatureReconciliations(
	projectData *WatchCodePluginProjectData,
	parsedSignatures map[string]CallableSignatureResult,
	state *watchCodeScanPlanState,
) error {
	if len(parsedSignatures) == 0 {
		return nil
	}
	for _, identity := range sortedCallableSignatureResultIdentities(parsedSignatures) {
		if _, ok := state.pendingByIdentity[identity]; ok {
			continue
		}
		if _, ok := state.signatureRefetchByIdentity[identity]; ok {
			continue
		}
		parsedSignature := parsedSignatures[identity]
		if parsedSignature.Status != SignatureHelpStatusMatched {
			continue
		}
		mismatched, err := p.watchCodeParsedSignatureParamsMismatch(projectData, identity, parsedSignature.Params)
		if err != nil {
			return err
		}
		if mismatched {
			state.trackSignatureRefetch(identity, watchcode.CallableInfo{})
		}
	}
	return nil
}

func applyWatchCodeAdditions(
	projectData *WatchCodePluginProjectData,
	sourcePath string,
	additions []watchcode.CallableInfo,
	state *watchCodeScanPlanState,
) bool {
	didUpdate := false
	for _, addition := range additions {
		if _, ok := projectData.Registry[addition.Identity]; !ok {
			projectData.Registry[addition.Identity] = WatchCodeRegistryEntry{
				CallableName:  addition.CanonicalName,
				Kind:          fromWatchcodeCallableKind(addition.Kind),
				SignatureHash: addition.SignatureHash,
				BodyHash:      addition.BodyHash,
				SourcePath:    sourcePath,
				SectionIDs:    []string{},
				SectionsCount: 0,
			}
			didUpdate = true
		}
		state.trackPending(addition.Identity, addition)
	}
	return didUpdate
}

func sortedCallableSignatureResultIdentities(signatures map[string]CallableSignatureResult) []string {
	identities := make([]string, 0, len(signatures))
	for identity := range signatures {
		identities = append(identities, identity)
	}
	sort.Strings(identities)
	return identities
}

func (p *Project) ensurePendingWatchCodeCallableSections(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	pendingByIdentity map[string]watchcode.CallableInfo,
	resolver CallableSignatureResolver,
	parsedSignatures map[string]CallableSignatureResult,
) (bool, error) {
	didUpdate := false
	for _, identity := range sortedWatchCodeCallableIdentities(pendingByIdentity) {
		updated, err := p.ensureWatchCodeCallableSection(
			ctx,
			projectData,
			identity,
			pendingByIdentity[identity],
			resolver,
			parsedSignatures[identity],
		)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) refetchPendingWatchCodeCallableSections(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	signatureRefetchByIdentity map[string]watchcode.CallableInfo,
	resolver CallableSignatureResolver,
	parsedSignatures map[string]CallableSignatureResult,
) (bool, error) {
	didUpdate := false
	for _, identity := range sortedWatchCodeCallableIdentities(signatureRefetchByIdentity) {
		updated, err := p.refetchWatchCodeCallableSections(
			ctx,
			projectData,
			identity,
			resolver,
			parsedSignatures[identity],
		)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func sortedWatchCodeCallableIdentities(callablesByIdentity map[string]watchcode.CallableInfo) []string {
	identities := make([]string, 0, len(callablesByIdentity))
	for identity := range callablesByIdentity {
		identities = append(identities, identity)
	}
	sort.Strings(identities)
	return identities
}
