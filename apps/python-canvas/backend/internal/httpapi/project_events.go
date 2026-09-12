package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

func handleProjectEvents(response http.ResponseWriter, request *http.Request, service ProjectService) {
	if !requireMethod(response, request, http.MethodGet) || !rejectQuery(response, request) || !rejectRequestBody(response, request) {
		return
	}
	flusher, supported := response.(http.Flusher)
	if !supported {
		writeError(response, http.StatusInternalServerError, contracts.APIErrorCodeInternalV2, "Project event streaming is unavailable.")
		return
	}

	response.Header().Set("Content-Type", "text/event-stream")
	response.Header().Set("Cache-Control", "no-cache, no-transform")
	response.Header().Set("X-Accel-Buffering", "no")
	response.WriteHeader(http.StatusOK)

	stream := service.SubscribeProjectSnapshots(request.Context())
	for {
		select {
		case <-request.Context().Done():
			return
		case snapshot, open := <-stream:
			if !open {
				return
			}
			encoded, err := json.Marshal(snapshot)
			if err != nil {
				return
			}
			if _, err := response.Write(append(append([]byte("data: "), encoded...), '\n', '\n')); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
