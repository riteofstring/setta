package runtime

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"

	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/realtime/backend/internal/materialization"
)

func computeFingerprint(sourceVersion string, handler string, arguments map[string]json.RawMessage) (string, error) {
	normalized := make(map[string]any, len(arguments))
	for name, raw := range arguments {
		value, err := decodeFingerprintValue(raw)
		if err != nil {
			return "", err
		}
		prepared, err := normalizeFingerprintValue(value)
		if err != nil {
			return "", err
		}
		normalized[name] = prepared
	}
	encoded, err := json.Marshal(map[string]any{
		"arguments":     normalized,
		"handler":       handler,
		"sourceVersion": sourceVersion,
	})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func decodeFingerprintValue(raw json.RawMessage) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("runtime: fingerprint argument contains multiple JSON values")
		}
		return nil, err
	}
	return value, nil
}

func normalizeFingerprintValue(value any) (any, error) {
	switch typed := value.(type) {
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			normalized, err := normalizeFingerprintValue(item)
			if err != nil {
				return nil, err
			}
			result[index] = normalized
		}
		return result, nil
	case map[string]any:
		if looksLikeContentReference(typed) {
			encoded, err := json.Marshal(typed)
			if err != nil {
				return nil, err
			}
			var reference contracts.ContentReference
			if err := contracts.DecodeStrict(encoded, &reference); err != nil {
				return nil, err
			}
			if err := reference.Validate(); err != nil {
				return nil, err
			}
			return map[string]any{
				"byteLength": reference.ByteLength,
				"mediaType":  reference.MediaType,
				"sha256":     reference.SHA256,
			}, nil
		}
		result := make(map[string]any, len(typed))
		for key, item := range typed {
			normalized, err := normalizeFingerprintValue(item)
			if err != nil {
				return nil, err
			}
			result[key] = normalized
		}
		return result, nil
	default:
		return value, nil
	}
}

func (coordinator *Coordinator) startupBindingSignatureLocked(binding contracts.Binding) string {
	lineage := make([]contracts.Binding, 0)
	for _, bindingID := range coordinator.pipeline.TopologicalOrder {
		if pipelineBindingInfluences(coordinator.pipeline, bindingID, binding.ID) {
			lineage = append(lineage, coordinator.pipeline.Bindings[bindingID])
		}
	}
	if len(lineage) == 0 {
		lineage = append(lineage, binding)
	}
	signatureBytes, err := json.Marshal(lineage)
	if err != nil {
		return ""
	}
	signatureDigest := sha256.Sum256(signatureBytes)
	return hex.EncodeToString(signatureDigest[:])
}

func pipelineBindingInfluences(pipeline contracts.CompiledPipeline, candidateID string, targetID string) bool {
	if candidateID == targetID {
		return true
	}
	for _, descendantID := range pipeline.DescendantsByBinding[candidateID] {
		if descendantID == targetID {
			return true
		}
	}
	return false
}

func (coordinator *Coordinator) startupActionLocked(binding contracts.Binding, fingerprint string, target bool) startupAction {
	savedFingerprint, retained := coordinator.materializedHashes[binding.ID]
	if !target {
		return startupDependencyAction(savedFingerprint, fingerprint, retained)
	}
	policy := binding.Materialization
	if policy == nil {
		return startupSkip
	}
	return startupTargetAction(*policy, savedFingerprint, fingerprint, retained)
}

func startupDependencyAction(savedFingerprint string, fingerprint string, retained bool) startupAction {
	if retained && savedFingerprint == fingerprint {
		return startupAdopt
	}
	return startupRun
}

func startupTargetAction(policy contracts.MaterializationPolicy, savedFingerprint string, fingerprint string, retained bool) startupAction {
	switch policy.Startup {
	case "always":
		return startupRun
	case "whenStale":
		if retained && savedFingerprint == fingerprint {
			return startupAdopt
		}
		return startupRun
	case "ifMissing":
		if !retained {
			return startupRun
		}
		if savedFingerprint == fingerprint {
			return startupAdopt
		}
		return startupSkip
	default:
		return startupSkip
	}
}

func supportsAutomaticStartup(binding contracts.Binding) bool {
	return binding.Materialization != nil && binding.Materialization.Startup != "manual"
}

func hasDurableMaterialization(binding contracts.Binding) bool {
	return binding.Materialization != nil && binding.Materialization.Retention == "lastSuccessful"
}

func (coordinator *Coordinator) resetRuntimeLocked(projectSnapshot contracts.Project, sourceVersion string) []contracts.ContentReference {
	previousOutputs := coordinator.materializedOutput
	previousReferences := coordinator.materializedRefs
	previousFingerprints := coordinator.materializedHashes
	runtimeReferences := coordinator.runtimeReferencesLocked()
	if valueReferences, err := contentReferencesInRawMap(coordinator.values); err == nil {
		runtimeReferences = appendUniqueReferences(runtimeReferences, valueReferences)
	}
	coordinator.values = make(map[string]json.RawMessage)
	coordinator.invocations = make(map[string]contracts.InvocationStatus)
	coordinator.invocationBindings = make(map[string]contracts.Binding)
	coordinator.invocationOutputs = make(map[string]map[string]json.RawMessage)
	coordinator.invocationHashes = make(map[string]string)
	coordinator.invocationHolds = make(map[string]bool)
	coordinator.runs = make(map[string]*pipelineRun)
	coordinator.invocationRuns = make(map[string]string)
	coordinator.sequences = make(map[string]uint64)
	coordinator.publishedByBinding = make(map[string]contracts.InvocationIdentity)
	coordinator.retainedByBinding = make(map[string]bool)
	coordinator.materializedOutput = make(map[string]map[string]json.RawMessage)
	coordinator.materializedRefs = make(map[string][]contracts.ContentReference)
	coordinator.materializedHashes = make(map[string]string)
	coordinator.startupAttempts = make(map[string]string)
	coordinator.active = make(map[string]struct{})
	coordinator.sourceVersion = sourceVersion
	carriedReferences := make(map[string]struct{})
	for _, binding := range projectSnapshot.Bindings {
		if !hasDurableMaterialization(binding) {
			continue
		}
		fingerprint, exists := previousFingerprints[binding.ID]
		if !exists {
			continue
		}
		outputs := cloneRawMap(previousOutputs[binding.ID])
		references := append([]contracts.ContentReference(nil), previousReferences[binding.ID]...)
		coordinator.materializedOutput[binding.ID] = outputs
		coordinator.materializedRefs[binding.ID] = references
		coordinator.materializedHashes[binding.ID] = fingerprint
		coordinator.retainedByBinding[binding.ID] = true
		coordinator.applyOutputsLocked(binding, outputs)
		for _, reference := range references {
			carriedReferences[reference.ID] = struct{}{}
		}
	}
	discarded := append([]contracts.ContentReference(nil), runtimeReferences...)
	for _, references := range previousReferences {
		for _, reference := range references {
			if _, carried := carriedReferences[reference.ID]; !carried {
				discarded = appendUniqueReferences(discarded, []contracts.ContentReference{reference})
			}
		}
	}
	return referenceDifference(discarded, retainedReferences(coordinator.materializedRefs))
}

func retainedReferences(current map[string][]contracts.ContentReference) []contracts.ContentReference {
	retained := []contracts.ContentReference{}
	for _, references := range current {
		retained = appendUniqueReferences(retained, references)
	}
	return retained
}

func (coordinator *Coordinator) dropUnretainedMaterializationsLocked(bindings map[string]contracts.Binding) []contracts.ContentReference {
	discarded := []contracts.ContentReference{}
	for bindingID := range coordinator.materializedHashes {
		binding, exists := bindings[bindingID]
		if exists && hasDurableMaterialization(binding) {
			continue
		}
		discarded = appendUniqueReferences(discarded, coordinator.materializedRefs[bindingID])
		delete(coordinator.materializedOutput, bindingID)
		delete(coordinator.materializedRefs, bindingID)
		delete(coordinator.materializedHashes, bindingID)
		delete(coordinator.retainedByBinding, bindingID)
	}
	retained := []contracts.ContentReference{}
	for _, references := range coordinator.materializedRefs {
		retained = appendUniqueReferences(retained, references)
	}
	return referenceDifference(discarded, retained)
}

func (coordinator *Coordinator) reconcileMaterializations(projectSnapshot contracts.Project) {
	keep := make(map[string]struct{})
	for _, binding := range projectSnapshot.Bindings {
		if hasDurableMaterialization(binding) {
			keep[binding.ID] = struct{}{}
		}
	}
	if err := coordinator.materializations.Prune(keep); err != nil {
		coordinator.publishMaterializationError(err)
	}
}

type restoredMaterialization struct {
	binding  contracts.Binding
	restored materialization.Restored
}

func (coordinator *Coordinator) restoreMaterializations(projectSnapshot contracts.Project, sessionID string) {
	restored := []restoredMaterialization{}
	for _, binding := range projectSnapshot.Bindings {
		if candidate, exists := coordinator.restoreMaterialization(binding, sessionID); exists {
			restored = append(restored, candidate)
		}
	}
	if len(restored) == 0 {
		return
	}
	coordinator.mu.Lock()
	if coordinator.closed || coordinator.sessionID != sessionID {
		coordinator.mu.Unlock()
		for _, candidate := range restored {
			_ = coordinator.content.DeleteReferences(candidate.restored.Content)
		}
		return
	}
	for _, candidate := range restored {
		bindingID := candidate.binding.ID
		coordinator.materializedOutput[bindingID] = cloneRawMap(candidate.restored.Outputs)
		coordinator.materializedRefs[bindingID] = append([]contracts.ContentReference(nil), candidate.restored.Content...)
		coordinator.materializedHashes[bindingID] = candidate.restored.Fingerprint
		coordinator.retainedByBinding[bindingID] = true
		coordinator.applyOutputsLocked(candidate.binding, candidate.restored.Outputs)
	}
	coordinator.publishSnapshotLocked()
	coordinator.mu.Unlock()
}

func (coordinator *Coordinator) restoreMaterialization(binding contracts.Binding, sessionID string) (restoredMaterialization, bool) {
	if !hasDurableMaterialization(binding) {
		return restoredMaterialization{}, false
	}
	coordinator.mu.Lock()
	_, loaded := coordinator.materializedHashes[binding.ID]
	coordinator.mu.Unlock()
	if loaded {
		return restoredMaterialization{}, false
	}
	restored, err := coordinator.materializations.Restore(binding.ID, sessionID, coordinator.content)
	if err != nil {
		coordinator.handleMaterializationRestoreError(binding.ID, restored.Content, err)
		return restoredMaterialization{}, false
	}
	return restoredMaterialization{binding: binding, restored: restored}, true
}

func (coordinator *Coordinator) handleMaterializationRestoreError(bindingID string, references []contracts.ContentReference, err error) {
	_ = coordinator.content.DeleteReferences(references)
	if errors.Is(err, materialization.ErrCorrupt) {
		_ = coordinator.materializations.Delete(bindingID)
	}
	if !errors.Is(err, materialization.ErrNotFound) {
		coordinator.publishMaterializationError(err)
	}
}

func (coordinator *Coordinator) mergeInvocationOutputsLocked(invocationID string, outputs map[string]json.RawMessage) {
	current := coordinator.invocationOutputs[invocationID]
	if current == nil {
		current = make(map[string]json.RawMessage)
		coordinator.invocationOutputs[invocationID] = current
	}
	for name, value := range outputs {
		current[name] = append(json.RawMessage(nil), value...)
	}
}

func (coordinator *Coordinator) persistInvocationLocked(binding contracts.Binding, identity contracts.InvocationIdentity) {
	if !hasDurableMaterialization(binding) {
		return
	}
	outputs := cloneRawMap(coordinator.invocationOutputs[identity.InvocationID])
	fingerprint := coordinator.invocationHashes[identity.InvocationID]
	if err := coordinator.materializations.Replace(binding.ID, fingerprint, outputs, coordinator.content); err != nil {
		coordinator.publishMaterializationErrorLocked(err)
		return
	}
	references, err := contentReferencesInRawMap(outputs)
	if err != nil {
		coordinator.publishMaterializationErrorLocked(err)
		return
	}
	previous := coordinator.materializedRefs[binding.ID]
	coordinator.materializedOutput[binding.ID] = cloneRawMap(outputs)
	coordinator.materializedRefs[binding.ID] = references
	coordinator.materializedHashes[binding.ID] = fingerprint
	_ = coordinator.content.DeleteReferences(referenceDifference(previous, references))
}

func contentReferencesInRawMap(values map[string]json.RawMessage) ([]contracts.ContentReference, error) {
	references := []contracts.ContentReference{}
	for _, raw := range values {
		var value any
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		discovered, err := contentReferencesInValue(value)
		if err != nil {
			return nil, err
		}
		references = appendUniqueReferences(references, discovered)
	}
	return references, nil
}

func referenceDifference(previous []contracts.ContentReference, current []contracts.ContentReference) []contracts.ContentReference {
	currentIDs := make(map[string]struct{}, len(current))
	for _, reference := range current {
		currentIDs[reference.ID] = struct{}{}
	}
	result := []contracts.ContentReference{}
	for _, reference := range previous {
		if _, exists := currentIDs[reference.ID]; !exists {
			result = append(result, reference)
		}
	}
	return result
}

func (coordinator *Coordinator) publishMaterializationError(err error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if !coordinator.closed {
		coordinator.publishMaterializationErrorLocked(err)
	}
}

func (coordinator *Coordinator) publishMaterializationErrorLocked(err error) {
	failure := contracts.StructuredError{Code: "materialization_error", Message: err.Error()}
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "error", Error: &failure})
}
