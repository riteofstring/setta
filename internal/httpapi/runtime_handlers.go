package httpapi

import (
	"net/http"
	"strings"
)

func (handler handler) runtimeInfo(response http.ResponseWriter, request *http.Request) {
	if handler.runtimeMetadata.ID == "" {
		writeError(response, http.StatusInternalServerError, "runtime_identity_unavailable", "runtime identity is not available")
		return
	}
	infrastructureProvider := handler.runtimeMetadata.InfrastructureProvider
	if infrastructureProvider.ID == "" {
		infrastructureProvider = UnknownRuntimeInfrastructureProvider()
	}
	writeJSON(response, http.StatusOK, RuntimeInfoResponse{
		RuntimeID:              handler.runtimeMetadata.ID,
		DisplayName:            handler.runtimeMetadata.DisplayName,
		InfrastructureProvider: infrastructureProvider,
		BackendName:            handler.metadata.Name,
		BackendVersion:         handler.metadata.Version,
		ProtocolVersion:        ProtocolVersion,
		VAPIDPublicKey:         handler.notifyPublicKey(),
	})
}

func (handler handler) completePairing(response http.ResponseWriter, request *http.Request) {
	service := requireRuntimeAuthService(response, handler.runtimeAuthService)
	if service == nil {
		return
	}
	if !handler.pairingFailureLimiter.AllowAttempt() {
		writeError(response, http.StatusTooManyRequests, "pairing_rate_limited", "too many failed pairing attempts")
		return
	}
	var payload CompletePairingRequest
	if !decodeRequest(response, request, &payload) {
		handler.pairingFailureLimiter.RecordFailure()
		return
	}
	if strings.TrimSpace(payload.PairingToken) == "" || strings.TrimSpace(payload.ClientDisplayName) == "" {
		handler.pairingFailureLimiter.RecordFailure()
		writeError(response, http.StatusBadRequest, "invalid_pairing_request", "pairing token and client display name are required")
		return
	}
	session, deviceToken, ok, err := service.CompletePairing(
		request.Context(),
		payload.PairingToken,
		payload.ClientDisplayName,
	)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "complete_pairing_failed", err.Error())
		return
	}
	if !ok {
		handler.pairingFailureLimiter.RecordFailure()
		writeError(response, http.StatusUnauthorized, "invalid_pairing_token", "pairing token is invalid, expired, or already used")
		return
	}
	writeJSON(response, http.StatusOK, CompletePairingResponse{
		DeviceID:        session.ID,
		DeviceToken:     deviceToken,
		RuntimeID:       handler.runtimeMetadata.ID,
		ProtocolVersion: ProtocolVersion,
	})
}

func (handler handler) listDevices(response http.ResponseWriter, request *http.Request) {
	service := requireRuntimeAuthService(response, handler.runtimeAuthService)
	if service == nil {
		return
	}
	var payload ListDevicesRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	devices, err := service.ListDeviceSessions(request.Context())
	if err != nil {
		writeError(response, http.StatusInternalServerError, "list_devices_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, ListDevicesResponse{Devices: devices})
}

func (handler handler) revokeDevice(response http.ResponseWriter, request *http.Request) {
	service := requireRuntimeAuthService(response, handler.runtimeAuthService)
	if service == nil {
		return
	}
	var payload RevokeDeviceRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	if strings.TrimSpace(payload.DeviceID) == "" {
		writeError(response, http.StatusBadRequest, "invalid_revoke_device_request", "device id is required")
		return
	}
	device, ok, err := service.RevokeDeviceSession(request.Context(), payload.DeviceID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "revoke_device_failed", err.Error())
		return
	}
	if !ok {
		writeError(response, http.StatusNotFound, "device_not_found", "device session was not found")
		return
	}
	if handler.notifyService != nil {
		if err := handler.notifyService.RemoveDeviceSubscriptions(request.Context(), payload.DeviceID); err != nil {
			writeError(response, http.StatusInternalServerError, "delete_device_push_subscriptions_failed", err.Error())
			return
		}
	}
	writeJSON(response, http.StatusOK, RevokeDeviceResponse{Device: device})
}

func (handler handler) notifyPublicKey() string {
	if handler.notifyService == nil {
		return ""
	}
	return handler.notifyService.PublicKey()
}
