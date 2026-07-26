package controlplane

import (
	"net/http"
	"time"
)

func handleRuntimeAdminRoute(
	store *Store,
	observer ControlPlaneObserver,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	return handleRuntimeProgressAdminRoute(store, response, request) ||
		handleRuntimePolicyAdminRoute(store, observer, response, request)
}

func handleRuntimePolicyAdminRoute(
	store *Store,
	observer ControlPlaneObserver,
	response http.ResponseWriter,
	request *http.Request,
) bool {
	switch request.URL.Path {
	case "/v1/runtimes/access":
		handleRuntimeAccessAdmin(store, observer, response, request)
		return true
	case "/v1/runtimes/wake":
		if !requireAdminMethod(response, request, http.MethodPost) {
			return true
		}
		response.Header().Set("Content-Type", "application/json")
		var payload AdminRequestRuntimeWakeRequest
		if !decodeAdminRequest(response, request, &payload) {
			return true
		}
		runtime, err := store.RequestRuntimeWake(
			request.Context(),
			payload.IdempotencyKey,
			payload.RuntimeName,
		)
		if err != nil {
			writeAdminError(response)
			return true
		}
		observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
			Action:     ControlPlaneAuditRuntimeWakeRequested,
			OccurredAt: runtime.UpdatedAt,
			State:      "requested",
		})
		writeAdminJSON(response, AdminEvent{Event: "runtime_wake_requested", Status: "requested"})
		return true
	case "/v1/runtimes/deletion/schedule":
		handleRuntimeDeletionScheduleAdmin(store, observer, response, request)
		return true
	case "/v1/runtimes/deletion/cancel":
		handleRuntimeDeletionCancellationAdmin(store, observer, response, request)
		return true
	case "/v1/runtimes/metadata/read":
		handleRuntimeMetadataInspectionAdmin(store, observer, response, request)
		return true
	case "/v1/runtimes/health":
		handleRuntimeHealthAdmin(store, observer, response, request)
		return true
	case "/v1/runtimes/reporting-credential":
		handleRuntimeReportingCredentialAdmin(store, observer, response, request)
		return true
	default:
		return false
	}
}

func handleRuntimeAccessAdmin(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireAdminMethod(response, request, http.MethodPost) {
		return
	}
	response.Header().Set("Content-Type", "application/json")
	var payload AdminSetRuntimeAccessRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	if err := store.SetRuntimeAccessState(
		request.Context(),
		payload.RuntimeName,
		payload.AccessState,
	); err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditRuntimeAccessSet,
		OccurredAt: time.Now().UTC(),
		State:      string(payload.AccessState),
	})
	writeAdminJSON(response, AdminEvent{
		Event:  "runtime_access_set",
		Status: string(payload.AccessState),
	})
}

func handleRuntimeMetadataInspectionAdmin(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireAdminMethod(response, request, http.MethodPost) {
		return
	}
	response.Header().Set("Content-Type", "application/json")
	var payload AdminInspectRuntimeMetadataRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	runtime, err := store.Runtime(request.Context(), payload.RuntimeName)
	if err != nil {
		writeAdminError(response)
		return
	}
	metadata := AdminRuntimeMetadata{
		Lifecycle:           runtime.Lifecycle,
		AccessState:         runtime.AccessState,
		HealthState:         runtime.HealthState,
		DesiredRelease:      runtime.DesiredRelease,
		ObservedRelease:     runtime.ObservedRelease,
		ReleaseStatus:       runtime.ReleaseStatus(),
		Resources:           runtime.Resources,
		DeletionScheduledAt: runtime.DeletionScheduledAt,
		UpdatedAt:           runtime.UpdatedAt,
	}
	if err := metadata.Validate(); err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditRuntimeMetadataInspected,
		OccurredAt: time.Now().UTC(),
		State:      "read",
	})
	writeAdminJSON(response, metadata)
}

func handleRuntimeDeletionScheduleAdmin(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireAdminMethod(response, request, http.MethodPost) {
		return
	}
	response.Header().Set("Content-Type", "application/json")
	var payload AdminScheduleRuntimeDeletionRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	runtime, err := store.ScheduleRuntimeDeletion(
		request.Context(),
		ScheduleRuntimeDeletionRequest(payload),
	)
	if err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditRuntimeDeletionScheduled,
		OccurredAt: runtime.UpdatedAt,
		State:      "scheduled",
	})
	writeAdminJSON(response, AdminEvent{
		Event:  "runtime_deletion_scheduled",
		Status: "scheduled",
	})
}

func handleRuntimeDeletionCancellationAdmin(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireAdminMethod(response, request, http.MethodPost) {
		return
	}
	response.Header().Set("Content-Type", "application/json")
	var payload AdminCancelRuntimeDeletionRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	runtime, err := store.CancelRuntimeDeletion(
		request.Context(),
		payload.RuntimeName,
		payload.AccessState,
	)
	if err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditRuntimeDeletionCancelled,
		OccurredAt: runtime.UpdatedAt,
		State:      "cancelled",
	})
	writeAdminJSON(response, AdminEvent{
		Event:  "runtime_deletion_cancelled",
		Status: "cancelled",
	})
}

func handleRuntimeReportingCredentialAdmin(
	store *Store,
	observer ControlPlaneAuditObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireAdminMethod(response, request, http.MethodPost) {
		return
	}
	response.Header().Set("Content-Type", "application/json")
	var payload AdminRotateRuntimeReportingCredentialRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	rotation, err := store.RotateRuntimeReportingCredential(
		request.Context(),
		payload.RuntimeName,
		payload.Credential,
	)
	if err != nil {
		writeAdminError(response)
		return
	}
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditRuntimeReporterRotated,
		OccurredAt: rotation.UpdatedAt,
		State:      "rotated",
	})
	writeAdminJSON(response, AdminEvent{
		Event:  "runtime_reporting_credential_rotated",
		Status: "rotated",
	})
}

func handleRuntimeHealthAdmin(
	store *Store,
	observer ControlPlaneObserver,
	response http.ResponseWriter,
	request *http.Request,
) {
	if !requireAdminMethod(response, request, http.MethodPost) {
		return
	}
	response.Header().Set("Content-Type", "application/json")
	var payload AdminRecordRuntimeHealthRequest
	if !decodeAdminRequest(response, request, &payload) {
		return
	}
	result, err := store.RecordRuntimeHealth(request.Context(), RecordRuntimeHealthRequest{
		RuntimeName:     payload.RuntimeName,
		HealthState:     payload.HealthState,
		ObservedRelease: payload.ObservedRelease,
	})
	if err != nil {
		writeAdminError(response)
		return
	}
	observeRuntimeHealthAdministration(observer, result)
	writeAdminJSON(response, AdminEvent{
		Event:  "runtime_health_recorded",
		Status: string(result.Runtime.HealthState),
	})
}

func observeRuntimeHealthAdministration(
	observer ControlPlaneObserver,
	result RecordRuntimeHealthResult,
) {
	observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
		Action:     ControlPlaneAuditRuntimeHealthRecorded,
		OccurredAt: result.Runtime.UpdatedAt,
		State:      string(result.Runtime.HealthState),
	})
	if result.WakePending {
		state := string(result.Runtime.HealthState)
		if result.WakeCompleted {
			state = "completed"
		}
		observer.ObserveControlPlaneAudit(ControlPlaneAuditObservation{
			Action:     ControlPlaneAuditRuntimeWakeObserved,
			OccurredAt: result.Runtime.UpdatedAt,
			State:      state,
		})
	}
	if result.WakeCompleted {
		observer.ObserveRuntimeWakeTiming(RuntimeWakeTiming{
			CompletedAt: result.Runtime.UpdatedAt,
			Duration:    result.Runtime.UpdatedAt.Sub(result.WakeRequestedAt),
			StartedAt:   result.WakeRequestedAt,
		})
	}
}
