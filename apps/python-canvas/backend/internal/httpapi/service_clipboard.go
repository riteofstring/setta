package httpapi

import (
	"context"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func (service *CoordinatorService) CopyProjectClipboard(
	ctx context.Context,
	request contracts.CopyProjectClipboardRequestV2,
) (contracts.CopyProjectClipboardResponseV2, error) {
	payload, err := service.coordinator.CopySectionClipboard(ctx, aggregate.CopySectionClipboardCommand{
		ProjectID:        request.ProjectID,
		ObservedRevision: request.ObservedRevision,
		RootSectionIDs:   cloneSectionIDs(request.RootSectionIDs),
	})
	if err != nil {
		return contracts.CopyProjectClipboardResponseV2{}, err
	}
	mapped, err := projectClipboardPayloadV1(payload)
	if err != nil {
		return contracts.CopyProjectClipboardResponseV2{}, err
	}
	response := contracts.CopyProjectClipboardResponseV2{Payload: mapped}
	if err := response.Validate(); err != nil {
		return contracts.CopyProjectClipboardResponseV2{}, err
	}
	return response, nil
}

func (service *CoordinatorService) PasteProjectClipboard(
	ctx context.Context,
	request contracts.PasteProjectClipboardRequestV2,
) (contracts.PasteProjectClipboardResponseV2, error) {
	payload, err := projectClipboardPayloadFromV1(request.Payload)
	if err != nil {
		return contracts.PasteProjectClipboardResponseV2{}, err
	}
	snapshot, pastedRootIDs, err := service.coordinator.PasteSectionClipboard(ctx, aggregate.PasteSectionClipboardCommand{
		ProjectID:        request.ProjectID,
		ExpectedRevision: request.ExpectedRevision,
		Payload:          payload,
	})
	if err != nil {
		return contracts.PasteProjectClipboardResponseV2{}, err
	}
	mapped, err := snapshotV2(snapshot)
	if err != nil {
		return contracts.PasteProjectClipboardResponseV2{}, err
	}
	response := contracts.PasteProjectClipboardResponseV2{
		Snapshot:             mapped,
		PastedRootSectionIDs: cloneSectionIDs(pastedRootIDs),
	}
	if err := response.Validate(); err != nil {
		return contracts.PasteProjectClipboardResponseV2{}, err
	}
	return response, nil
}

func projectClipboardPayloadV1(payload aggregate.SectionClipboardPayload) (contracts.ProjectClipboardPayloadV1, error) {
	state, err := payload.State()
	if err != nil {
		return contracts.ProjectClipboardPayloadV1{}, err
	}
	callables, err := callablesV2(state)
	if err != nil {
		return contracts.ProjectClipboardPayloadV1{}, err
	}
	dictionaries, err := parameterDictionariesV2(state)
	if err != nil {
		return contracts.ProjectClipboardPayloadV1{}, err
	}
	return contracts.ProjectClipboardPayloadV1{
		Version:               contracts.ProjectClipboardPayloadVersionV1,
		RootSectionIDs:        cloneSectionIDs(payload.RootSectionIDs),
		Callables:             callables,
		ParameterDictionaries: dictionaries,
		Lists:                 listsV2(state.Lists),
	}, nil
}

func projectClipboardPayloadFromV1(payload contracts.ProjectClipboardPayloadV1) (aggregate.SectionClipboardPayload, error) {
	if err := payload.Validate(); err != nil {
		return aggregate.SectionClipboardPayload{}, err
	}
	callables, overrides, err := callablesFromV2(payload.Callables)
	if err != nil {
		return aggregate.SectionClipboardPayload{}, err
	}
	dictionaries := make([]aggregate.ParameterDictionary, 0, len(payload.ParameterDictionaries))
	for _, dictionary := range payload.ParameterDictionaries {
		entries, entryOverrides, err := dictionaryEntriesFromV2(dictionary.Entries)
		if err != nil {
			return aggregate.SectionClipboardPayload{}, err
		}
		for targetID, ui := range entryOverrides {
			overrides[targetID] = ui
		}
		dictionaries = append(dictionaries, aggregate.ParameterDictionary{
			ID:      dictionary.ID,
			Name:    dictionary.Name,
			Entries: entries,
		})
	}
	lists := make([]aggregate.List, 0, len(payload.Lists))
	for _, list := range payload.Lists {
		lists = append(lists, aggregate.List{
			ID:              list.ID,
			Name:            list.Name,
			ChildSectionIDs: cloneSectionIDs(list.ChildSectionIDs),
		})
	}
	result := aggregate.SectionClipboardPayload{
		Version:               payload.Version,
		RootSectionIDs:        cloneSectionIDs(payload.RootSectionIDs),
		Callables:             callables,
		ParameterDictionaries: dictionaries,
		ParameterUIOverrides:  overrides,
		Lists:                 lists,
	}
	if _, err := result.State(); err != nil {
		return aggregate.SectionClipboardPayload{}, err
	}
	return result, nil
}
