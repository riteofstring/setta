package contracts

import "fmt"

const (
	ProjectClipboardPayloadVersionV1 = 1
	maxProjectClipboardSectionsV1    = 768
)

type ProjectClipboardPayloadV1 struct {
	Version               int                     `json:"version"`
	RootSectionIDs        []string                `json:"rootSectionIds"`
	Callables             []CallableV2            `json:"callables"`
	ParameterDictionaries []ParameterDictionaryV2 `json:"parameterDictionaries"`
	Lists                 []ListV2                `json:"lists"`
}

type CopyProjectClipboardRequestV2 struct {
	ProjectID        string   `json:"projectId"`
	ObservedRevision int      `json:"observedRevision"`
	RootSectionIDs   []string `json:"rootSectionIds"`
}

type CopyProjectClipboardResponseV2 struct {
	Payload ProjectClipboardPayloadV1 `json:"payload"`
}

type PasteProjectClipboardRequestV2 struct {
	ProjectID        string                    `json:"projectId"`
	ExpectedRevision int                       `json:"expectedRevision"`
	Payload          ProjectClipboardPayloadV1 `json:"payload"`
}

type PasteProjectClipboardResponseV2 struct {
	Snapshot             ProjectSnapshotV2 `json:"snapshot"`
	PastedRootSectionIDs []string          `json:"pastedRootSectionIds"`
}

func (payload ProjectClipboardPayloadV1) Validate() error {
	if payload.Version != ProjectClipboardPayloadVersionV1 {
		return ValidationError{Field: "payload.version", Problem: "is unsupported"}
	}
	if len(payload.RootSectionIDs) == 0 {
		return ValidationError{Field: "payload.rootSectionIds", Problem: "must be a nonempty array"}
	}
	if payload.Callables == nil || payload.ParameterDictionaries == nil || payload.Lists == nil {
		return ValidationError{Field: "payload", Problem: "must contain section arrays"}
	}
	if len(payload.Callables)+len(payload.ParameterDictionaries)+len(payload.Lists) > maxProjectClipboardSectionsV1 {
		return ValidationError{Field: "payload", Problem: "contains too many sections"}
	}
	snapshot := ProjectSnapshotV2{
		Project:               ProjectV2{},
		Callables:             payload.Callables,
		ParameterDictionaries: payload.ParameterDictionaries,
		Lists:                 payload.Lists,
		TopLevelSectionIDs:    payload.RootSectionIDs,
	}
	if _, _, err := validateSnapshotSections(snapshot); err != nil {
		return fmt.Errorf("validate project clipboard sections: %w", err)
	}
	return nil
}

func (request CopyProjectClipboardRequestV2) Validate() error {
	if err := validateObservedProject(request.ProjectID, request.ObservedRevision); err != nil {
		return err
	}
	return validateClipboardRootIDs("rootSectionIds", request.RootSectionIDs)
}

func (response CopyProjectClipboardResponseV2) Validate() error {
	return response.Payload.Validate()
}

func (request PasteProjectClipboardRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return request.Payload.Validate()
}

func (response PasteProjectClipboardResponseV2) Validate() error {
	if err := response.Snapshot.Validate(); err != nil {
		return err
	}
	if err := validateClipboardRootIDs("pastedRootSectionIds", response.PastedRootSectionIDs); err != nil {
		return err
	}
	topLevel := make(map[string]struct{}, len(response.Snapshot.TopLevelSectionIDs))
	for _, sectionID := range response.Snapshot.TopLevelSectionIDs {
		topLevel[sectionID] = struct{}{}
	}
	for index, sectionID := range response.PastedRootSectionIDs {
		if _, exists := topLevel[sectionID]; !exists {
			return ValidationError{Field: fmt.Sprintf("pastedRootSectionIds[%d]", index), Problem: "must reference a top-level section"}
		}
	}
	return nil
}

func validateObservedProject(projectID string, observedRevision int) error {
	if err := requireStableID("projectId", projectID); err != nil {
		return err
	}
	if observedRevision < 1 {
		return ValidationError{Field: "observedRevision", Problem: "must be at least 1"}
	}
	return nil
}

func validateClipboardRootIDs(field string, values []string) error {
	if len(values) == 0 {
		return ValidationError{Field: field, Problem: "must be a nonempty array"}
	}
	if len(values) > maxProjectClipboardSectionsV1 {
		return ValidationError{Field: field, Problem: "contains too many sections"}
	}
	seen := make(map[string]struct{}, len(values))
	for index, value := range values {
		entryField := fmt.Sprintf("%s[%d]", field, index)
		if err := requireStableID(entryField, value); err != nil {
			return err
		}
		if _, exists := seen[value]; exists {
			return ValidationError{Field: entryField, Problem: "must be unique"}
		}
		seen[value] = struct{}{}
	}
	return nil
}
