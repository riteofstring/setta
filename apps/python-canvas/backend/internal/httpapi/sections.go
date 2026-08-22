package httpapi

import (
	"net/http"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

type namedSectionPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Name             *string `json:"name"`
}

type sectionMutationPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
}

type countSectionMutationPayload struct {
	ProjectID        *string `json:"projectId"`
	ExpectedRevision *int    `json:"expectedRevision"`
	Count            *int    `json:"count"`
}

type setDictionaryEntriesPayload struct {
	ProjectID        *string                        `json:"projectId"`
	ExpectedRevision *int                           `json:"expectedRevision"`
	Entries          *[]contracts.DictionaryEntryV2 `json:"entries"`
}

type replaceSectionForestPayload struct {
	ProjectID          *string                     `json:"projectId"`
	ExpectedRevision   *int                        `json:"expectedRevision"`
	TopLevelSectionIDs *[]string                   `json:"topLevelSectionIds"`
	ListChildren       *[]contracts.ListChildrenV2 `json:"listChildren"`
}

func (payload namedSectionPayload) values() (string, int, string, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Name == nil {
		return "", 0, "", false
	}
	return *payload.ProjectID, *payload.ExpectedRevision, *payload.Name, true
}

func (payload sectionMutationPayload) values() (string, int, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil {
		return "", 0, false
	}
	return *payload.ProjectID, *payload.ExpectedRevision, true
}

func (payload countSectionMutationPayload) values() (string, int, int, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Count == nil {
		return "", 0, 0, false
	}
	return *payload.ProjectID, *payload.ExpectedRevision, *payload.Count, true
}

func dispatchSectionCollectionRoute(response http.ResponseWriter, request *http.Request, service ProjectService) bool {
	switch {
	case isExactPath(request, contracts.ProjectParameterDictionariesPathV2):
		handleCreateParameterDictionary(response, request, service)
	case isExactPath(request, contracts.ProjectListsPathV2):
		handleCreateList(response, request, service)
	case isExactPath(request, contracts.ProjectForestPathV2):
		handleReplaceSectionForest(response, request, service)
	default:
		return false
	}
	return true
}

func dispatchSectionItemRoute(response http.ResponseWriter, request *http.Request, service ProjectService) bool {
	if dictionaryID, action, matched := sectionRoute(request, contracts.ProjectParameterDictionariesPathV2); matched {
		switch action {
		case "rename":
			handleRenameParameterDictionary(response, request, service, dictionaryID)
		case "delete":
			handleDeleteParameterDictionary(response, request, service, dictionaryID)
		case "entries":
			handleSetParameterDictionaryEntries(response, request, service, dictionaryID)
		default:
			writeNotFound(response)
		}
		return true
	}
	if listID, action, matched := sectionRoute(request, contracts.ProjectListsPathV2); matched {
		switch action {
		case "rename":
			handleRenameList(response, request, service, listID)
		case "delete":
			handleDeleteList(response, request, service, listID)
		case "increment":
			handleIncrementListChildren(response, request, service, listID)
		case "decrement":
			handleDecrementListChildren(response, request, service, listID)
		default:
			writeNotFound(response)
		}
		return true
	}
	return false
}

func handleCreateParameterDictionary(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload namedSectionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, name, complete := payload.values()
	body := contracts.CreateParameterDictionaryRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision, Name: name}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Create Parameter Dictionary request is invalid.")
		return
	}
	snapshot, err := service.CreateParameterDictionary(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleRenameParameterDictionary(response http.ResponseWriter, request *http.Request, service ProjectService, dictionaryID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload namedSectionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, name, complete := payload.values()
	body := contracts.RenameParameterDictionaryRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision, Name: name}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Parameter Dictionary rename request is invalid.")
		return
	}
	snapshot, err := service.RenameParameterDictionary(request.Context(), dictionaryID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleDeleteParameterDictionary(response http.ResponseWriter, request *http.Request, service ProjectService, dictionaryID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload sectionMutationPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, complete := payload.values()
	body := contracts.DeleteParameterDictionaryRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Delete Parameter Dictionary request is invalid.")
		return
	}
	snapshot, err := service.DeleteParameterDictionary(request.Context(), dictionaryID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleSetParameterDictionaryEntries(response http.ResponseWriter, request *http.Request, service ProjectService, dictionaryID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload setDictionaryEntriesPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Entries == nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Parameter Dictionary entries request is invalid.")
		return
	}
	body := contracts.SetParameterDictionaryEntriesRequestV2{
		ProjectID:        *payload.ProjectID,
		ExpectedRevision: *payload.ExpectedRevision,
		Entries:          *payload.Entries,
	}
	if body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Parameter Dictionary entries request is invalid.")
		return
	}
	snapshot, err := service.SetParameterDictionaryEntries(request.Context(), dictionaryID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleCreateList(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload namedSectionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, name, complete := payload.values()
	body := contracts.CreateListRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision, Name: name}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Create List of Objects request is invalid.")
		return
	}
	snapshot, err := service.CreateList(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleRenameList(response http.ResponseWriter, request *http.Request, service ProjectService, listID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload namedSectionPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, name, complete := payload.values()
	body := contracts.RenameListRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision, Name: name}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "List of Objects rename request is invalid.")
		return
	}
	snapshot, err := service.RenameList(request.Context(), listID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleDeleteList(response http.ResponseWriter, request *http.Request, service ProjectService, listID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload sectionMutationPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, complete := payload.values()
	body := contracts.DeleteListRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Delete List of Objects request is invalid.")
		return
	}
	snapshot, err := service.DeleteList(request.Context(), listID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleIncrementListChildren(response http.ResponseWriter, request *http.Request, service ProjectService, listID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload countSectionMutationPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, count, complete := payload.values()
	body := contracts.IncrementListChildrenRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision, Count: count}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "List child increment request is invalid.")
		return
	}
	snapshot, err := service.IncrementListChildren(request.Context(), listID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleDecrementListChildren(response http.ResponseWriter, request *http.Request, service ProjectService, listID string) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload countSectionMutationPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	projectID, expectedRevision, count, complete := payload.values()
	body := contracts.DecrementListChildrenRequestV2{ProjectID: projectID, ExpectedRevision: expectedRevision, Count: count}
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "List child decrement request is invalid.")
		return
	}
	snapshot, err := service.DecrementListChildren(request.Context(), listID, body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}

func handleReplaceSectionForest(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload replaceSectionForestPayload
	if !decodeJSONBody(response, request, &payload) {
		return
	}
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.TopLevelSectionIDs == nil || payload.ListChildren == nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Section forest request is invalid.")
		return
	}
	body := contracts.ReplaceSectionForestRequestV2{
		ProjectID:          *payload.ProjectID,
		ExpectedRevision:   *payload.ExpectedRevision,
		TopLevelSectionIDs: *payload.TopLevelSectionIDs,
		ListChildren:       *payload.ListChildren,
	}
	if body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Section forest request is invalid.")
		return
	}
	snapshot, err := service.ReplaceSectionForest(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	writeSnapshot(response, snapshot)
}
