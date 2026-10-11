package httpapi

import (
	"net/http"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
)

const maxClipboardRequestBodyBytes int64 = 4 * 1024 * 1024

type copyProjectClipboardPayload struct {
	ProjectID        *string   `json:"projectId"`
	ObservedRevision *int      `json:"observedRevision"`
	RootSectionIDs   *[]string `json:"rootSectionIds"`
}

type pasteProjectClipboardPayload struct {
	ProjectID        *string                              `json:"projectId"`
	ExpectedRevision *int                                 `json:"expectedRevision"`
	Payload          *contracts.ProjectClipboardPayloadV1 `json:"payload"`
}

func (payload copyProjectClipboardPayload) contract() (contracts.CopyProjectClipboardRequestV2, bool) {
	if payload.ProjectID == nil || payload.ObservedRevision == nil || payload.RootSectionIDs == nil {
		return contracts.CopyProjectClipboardRequestV2{}, false
	}
	return contracts.CopyProjectClipboardRequestV2{
		ProjectID:        *payload.ProjectID,
		ObservedRevision: *payload.ObservedRevision,
		RootSectionIDs:   cloneSectionIDs(*payload.RootSectionIDs),
	}, true
}

func (payload pasteProjectClipboardPayload) contract() (contracts.PasteProjectClipboardRequestV2, bool) {
	if payload.ProjectID == nil || payload.ExpectedRevision == nil || payload.Payload == nil {
		return contracts.PasteProjectClipboardRequestV2{}, false
	}
	return contracts.PasteProjectClipboardRequestV2{
		ProjectID:        *payload.ProjectID,
		ExpectedRevision: *payload.ExpectedRevision,
		Payload:          *payload.Payload,
	}, true
}

func handleCopyProjectClipboard(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload copyProjectClipboardPayload
	if !decodeJSONBodyWithLimit(response, request, &payload, maxClipboardRequestBodyBytes) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Copy project sections request is invalid.")
		return
	}
	result, err := service.CopyProjectClipboard(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ObservedRevision)
		return
	}
	if err := result.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Unable to publish the project clipboard.")
		return
	}
	writeJSON(response, http.StatusOK, result)
}

func handlePasteProjectClipboard(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMutationMethod(response, request) || !rejectQuery(response, request) {
		return
	}
	var payload pasteProjectClipboardPayload
	if !decodeJSONBodyWithLimit(response, request, &payload, maxClipboardRequestBodyBytes) {
		return
	}
	body, complete := payload.contract()
	if !complete || body.Validate() != nil {
		writeError(response, http.StatusBadRequest, contracts.APIErrorCodeInvalidRequestV2, "Paste project sections request is invalid.")
		return
	}
	result, err := service.PasteProjectClipboard(request.Context(), body)
	if err != nil {
		writeServiceError(response, service, err, body.ExpectedRevision)
		return
	}
	if err := result.Validate(); err != nil {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Unable to publish the pasted project.")
		return
	}
	writeJSON(response, http.StatusOK, result)
}
