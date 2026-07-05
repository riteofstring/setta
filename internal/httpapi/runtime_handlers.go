package httpapi

import (
	"net/http"
	"net/url"
	"strings"

	"setta/internal/runtimeidentity"
)

func (handler handler) runtimeInfo(response http.ResponseWriter, request *http.Request) {
	identity, ok := handler.runtimeIdentity(response, request)
	if !ok {
		return
	}
	writeJSON(response, http.StatusOK, handler.runtimeInfoResponse(identity))
}

func (handler handler) updateRuntimeDisplayName(response http.ResponseWriter, request *http.Request) {
	service := requireRuntimeIdentityService(response, handler.runtimeIdentityService)
	if service == nil {
		return
	}
	var payload UpdateRuntimeDisplayNameRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	displayName, err := runtimeidentity.NormalizeDisplayName(payload.DisplayName)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_runtime_display_name", err.Error())
		return
	}
	identity, err := service.UpdateRuntimeDisplayName(request.Context(), displayName)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "update_runtime_display_name_failed", err.Error())
		return
	}
	if !validRuntimeIdentity(identity) {
		writeError(response, http.StatusInternalServerError, "runtime_identity_unavailable", "runtime identity is not available")
		return
	}
	writeJSON(response, http.StatusOK, handler.runtimeInfoResponse(identity))
}

func (handler handler) runtimeIdentity(response http.ResponseWriter, request *http.Request) (RuntimeIdentity, bool) {
	if handler.runtimeIdentityService != nil {
		identity, err := handler.runtimeIdentityService.RuntimeIdentity(request.Context())
		if err != nil {
			writeError(response, http.StatusInternalServerError, "runtime_identity_unavailable", err.Error())
			return RuntimeIdentity{}, false
		}
		if !validRuntimeIdentity(identity) {
			writeError(response, http.StatusInternalServerError, "runtime_identity_unavailable", "runtime identity is not available")
			return RuntimeIdentity{}, false
		}
		return identity, true
	}
	identity := RuntimeIdentity{
		ID:          handler.runtimeMetadata.ID,
		DisplayName: handler.runtimeMetadata.DisplayName,
	}
	if !validRuntimeIdentity(identity) {
		writeError(response, http.StatusInternalServerError, "runtime_identity_unavailable", "runtime identity is not available")
		return RuntimeIdentity{}, false
	}
	return identity, true
}

func (handler handler) runtimeInfoResponse(identity RuntimeIdentity) RuntimeInfoResponse {
	infrastructureProvider := handler.runtimeMetadata.InfrastructureProvider
	if infrastructureProvider.ID == "" {
		infrastructureProvider = UnknownRuntimeInfrastructureProvider()
	}
	return RuntimeInfoResponse{
		RuntimeID:              identity.ID,
		DisplayName:            identity.DisplayName,
		InfrastructureProvider: infrastructureProvider,
		BackendName:            handler.metadata.Name,
		BackendVersion:         handler.metadata.Version,
		ProtocolVersion:        ProtocolVersion,
		FeatureSet:             RuntimeFeatureSetIdentity(),
		VAPIDPublicKey:         handler.notifyPublicKey(),
	}
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
	identity, hasIdentity := handler.runtimeIdentity(response, request)
	if !hasIdentity {
		return
	}
	writeJSON(response, http.StatusOK, CompletePairingResponse{
		DeviceID:        session.ID,
		DeviceToken:     deviceToken,
		RuntimeID:       identity.ID,
		ProtocolVersion: ProtocolVersion,
	})
}

func (handler handler) createDevicePairing(response http.ResponseWriter, request *http.Request) {
	service := requireRuntimeAuthService(response, handler.runtimeAuthService)
	if service == nil {
		return
	}
	var payload CreateDevicePairingRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	runtimeBaseURL, err := validatedPhonePairingBaseURL(payload.RuntimeBaseURL)
	if err != nil {
		writeError(response, http.StatusBadRequest, "invalid_pairing_base_url", err.Error())
		return
	}
	pairing, token, err := service.CreatePairingToken(request.Context())
	if err != nil {
		writeError(response, http.StatusInternalServerError, "create_pairing_token_failed", err.Error())
		return
	}
	pairingURL := runtimeBaseURL
	pairingURL.Fragment = url.Values{"pair": []string{token}}.Encode()
	writeJSON(response, http.StatusOK, CreateDevicePairingResponse{
		PairingURL: pairingURL.String(),
		ExpiresAt:  pairing.ExpiresAt,
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

func requireRuntimeIdentityService(response http.ResponseWriter, service RuntimeIdentityService) RuntimeIdentityService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "runtime_identity_service_unavailable", "runtime identity service is not available")
		return nil
	}
	return service
}

func validRuntimeIdentity(identity RuntimeIdentity) bool {
	return strings.TrimSpace(identity.ID) != "" && strings.TrimSpace(identity.DisplayName) != ""
}

func validatedPhonePairingBaseURL(rawBaseURL string) (url.URL, error) {
	trimmed := strings.TrimSpace(rawBaseURL)
	if trimmed == "" {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl is invalid: " + err.Error())
	}
	if parsed.Scheme != "https" {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl must use https")
	}
	if parsed.Host == "" {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl must include a host")
	}
	if parsed.User != nil {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl must not include credentials")
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl must not include a path")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl must not include query or fragment")
	}
	hostName := strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
	if !strings.HasSuffix(hostName, ".ts.net") {
		return url.URL{}, errPhonePairingBaseURL("runtimeBaseUrl must be an official Tailscale ts.net hostname")
	}
	parsed.Path = "/"
	return *parsed, nil
}

func errPhonePairingBaseURL(message string) error {
	return phonePairingBaseURLError(message)
}

type phonePairingBaseURLError string

func (err phonePairingBaseURLError) Error() string {
	return string(err)
}
