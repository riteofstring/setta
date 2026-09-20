package httpapi

import (
	"net/http"

	"github.com/setta/local-backend/sse"
	"github.com/setta/python-canvas/backend/internal/contracts"
)

func handleProjectEvents(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMethod(response, request, http.MethodGet) || !rejectQuery(response, request) || !rejectRequestBody(response, request) {
		return
	}
	if !sse.Supported(response) {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Project event streaming is unavailable.")
		return
	}

	stream := service.SubscribeProjectSnapshots(request.Context())
	_ = sse.Serve(response, request, stream, "")
}
