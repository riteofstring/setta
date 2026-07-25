package controlplane

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"setta/internal/httpapi"
	"setta/internal/runtimeaccounting"
)

func runtimeAccountingReportHandler(
	store RuntimeAccountingReportStore,
	observer ControlPlaneAuditObserver,
) http.Handler {
	endpoint := httpapi.RuntimeAccountingReportEndpoint()
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != endpoint.Method {
			response.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		credential, authorized := runtimeReportingCredentialFromRequest(request)
		if !authorized {
			writeRuntimeAccountingReportError(response, http.StatusUnauthorized)
			return
		}
		runtimeName, authorized, err := store.AuthorizeRuntimeReporter(
			request.Context(),
			credential,
		)
		if err != nil {
			writeRuntimeAccountingReportError(response, http.StatusInternalServerError)
			return
		}
		if !authorized {
			writeRuntimeAccountingReportError(response, http.StatusUnauthorized)
			return
		}
		var transition runtimeaccounting.ActivityTransition
		if !decodeRuntimeAccountingReport(response, request, endpoint.RequestBodyLimitBytes, &transition) {
			return
		}
		_, err = store.RecordRuntimeAccountingEvent(
			request.Context(),
			RecordRuntimeAccountingEventRequest{
				RuntimeName: runtimeName,
				Transition:  transition,
			},
		)
		if err != nil {
			switch {
			case errors.Is(err, ErrIdempotencyConflict):
				writeRuntimeAccountingReportError(response, http.StatusConflict)
			case errors.Is(err, runtimeaccounting.ErrInvalidEvent):
				writeRuntimeAccountingReportError(response, http.StatusBadRequest)
			default:
				writeRuntimeAccountingReportError(response, http.StatusInternalServerError)
			}
			return
		}
		observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
			Action:     ControlPlaneAuditRuntimeUsageReported,
			OccurredAt: time.Now().UTC(),
			State:      "accepted",
		})
		response.WriteHeader(http.StatusNoContent)
	})
}

func runtimeReportingCredentialFromRequest(
	request *http.Request,
) (RuntimeReportingCredential, bool) {
	values := request.Header.Values("Authorization")
	if len(values) != 1 {
		return RuntimeReportingCredential{}, false
	}
	token, found := strings.CutPrefix(values[0], "Bearer ")
	if !found {
		return RuntimeReportingCredential{}, false
	}
	credential := RuntimeReportingCredential{Token: token}
	return credential, ValidateRuntimeReportingCredential(credential) == nil
}

func decodeRuntimeAccountingReport(
	response http.ResponseWriter,
	request *http.Request,
	maximumBytes int64,
	target *runtimeaccounting.ActivityTransition,
) bool {
	if request.ContentLength < 0 {
		writeRuntimeAccountingReportError(response, http.StatusLengthRequired)
		return false
	}
	if request.ContentLength > maximumBytes {
		writeRuntimeAccountingReportError(response, http.StatusRequestEntityTooLarge)
		return false
	}
	request.Body = http.MaxBytesReader(response, request.Body, maximumBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeRuntimeAccountingReportError(response, http.StatusBadRequest)
		return false
	}
	return true
}

func writeRuntimeAccountingReportError(response http.ResponseWriter, status int) {
	http.Error(response, http.StatusText(status), status)
}
