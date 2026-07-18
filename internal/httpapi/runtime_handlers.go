package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"setta/internal/localcredissuer"
	"setta/internal/runtimeauth"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeidentity"
	"setta/internal/runtimesetup"
)

func (handler handler) localCredentialEnroll(response http.ResponseWriter, request *http.Request) {
	if handler.localCredentialIssuer == nil {
		writeError(response, http.StatusNotFound, "local_credential_issuer_disabled", "local credential issuer is disabled")
		return
	}
	var payload LocalCredentialEnrollRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	enrolled, err := handler.localCredentialIssuer.Enroll(request.Context(), payload, ProtocolVersion)
	if errors.Is(err, localcredissuer.ErrInvalidPairingToken) {
		writeError(response, http.StatusUnauthorized, "invalid_pairing_token", "pairing token is invalid, expired, or already used")
		return
	}
	if err != nil {
		writeError(response, http.StatusBadRequest, "local_credential_enrollment_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, enrolled)
}

func (handler handler) localCredentialRefresh(response http.ResponseWriter, request *http.Request) {
	if handler.localCredentialIssuer == nil {
		writeError(response, http.StatusNotFound, "local_credential_issuer_disabled", "local credential issuer is disabled")
		return
	}
	var payload LocalCredentialRefreshRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	credential, err := handler.localCredentialIssuer.Refresh(request.Context(), payload)
	if errors.Is(err, localcredissuer.ErrInvalidDeviceSecret) || errors.Is(err, localcredissuer.ErrRuntimeMismatch) {
		writeUnauthorized(response)
		return
	}
	if err != nil {
		writeError(response, http.StatusBadRequest, "local_credential_refresh_failed", err.Error())
		return
	}
	writeJSON(response, http.StatusOK, credential)
}

func (handler handler) runtimeInfo(response http.ResponseWriter, request *http.Request) {
	identity, ok := handler.runtimeIdentity(response, request)
	if !ok {
		return
	}
	writeJSON(response, http.StatusOK, handler.runtimeInfoResponse(request.Context(), identity))
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
	writeJSON(response, http.StatusOK, handler.runtimeInfoResponse(request.Context(), identity))
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

func (handler handler) runtimeInfoResponse(ctx context.Context, identity RuntimeIdentity) RuntimeInfoResponse {
	infrastructureProvider := handler.runtimeMetadata.InfrastructureProvider
	if infrastructureProvider.ID == "" {
		infrastructureProvider = UnknownRuntimeInfrastructureProvider()
	}
	diagnostics := runtimecapability.RuntimeDiagnosticsUnavailable("diagnostics_service_not_configured")
	if handler.runtimeDiagnosticsService != nil {
		diagnostics = handler.runtimeDiagnosticsService.RuntimeDiagnostics(ctx)
	}
	return RuntimeInfoResponse{
		RuntimeID:              identity.ID,
		DisplayName:            identity.DisplayName,
		InfrastructureProvider: infrastructureProvider,
		BackendName:            handler.metadata.Name,
		BackendVersion:         handler.metadata.Version,
		ProtocolVersion:        ProtocolVersion,
		FeatureSet:             runtimecapability.RuntimeFeatureSetIdentity(),
		Diagnostics:            diagnostics,
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

func (handler handler) setupAttestation(response http.ResponseWriter, request *http.Request) {
	service := requireRuntimeSetupService(response, handler.runtimeSetupService)
	if service == nil {
		return
	}
	if !handler.setupAttestationLimiter.AllowAttempt() {
		writeError(response, http.StatusTooManyRequests, "setup_attestation_rate_limited", "too many failed setup attestation attempts")
		return
	}
	var payload SetupAttestationRequest
	if !decodeRequest(response, request, &payload) {
		handler.setupAttestationLimiter.RecordFailure()
		return
	}
	identity, hasIdentity := handler.runtimeIdentity(response, request)
	if !hasIdentity {
		handler.setupAttestationLimiter.RecordFailure()
		return
	}
	attestation, status, err := service.CreateAttestation(request.Context(), runtimesetup.AttestationChallenge{
		BackendName:    handler.metadata.Name,
		RuntimeID:      identity.ID,
		SetupID:        payload.SetupID,
		ReleaseVersion: handler.metadata.Version,
		FeatureSet:     runtimecapability.RuntimeFeatureSetIdentity(),
		Nonce:          payload.Nonce,
	})
	if err != nil {
		handler.setupAttestationLimiter.RecordFailure()
		if runtimesetup.IsPersistenceError(err) || runtimesetup.IsCorruptStateError(err) {
			writeError(response, http.StatusInternalServerError, "setup_attestation_failed", err.Error())
			return
		}
		writeError(response, http.StatusBadRequest, "invalid_setup_attestation_request", err.Error())
		return
	}
	if status != runtimesetup.AttestationOK {
		handler.setupAttestationLimiter.RecordFailure()
		statusCode, errorCode, message := setupAttestationFailure(status)
		writeError(response, statusCode, errorCode, message)
		return
	}
	writeJSON(response, http.StatusOK, SetupAttestationResponse{
		Algorithm:       attestation.Algorithm,
		BackendName:     attestation.BackendName,
		RuntimeID:       attestation.RuntimeID,
		RuntimeName:     attestation.RuntimeName,
		SetupID:         attestation.SetupID,
		ReleaseVersion:  attestation.ReleaseVersion,
		CredentialEpoch: int(attestation.CredentialEpoch),
		FeatureSet:      attestation.FeatureSet,
		Nonce:           attestation.Nonce,
		ExpiresAt:       attestation.ExpiresAt,
		Attestation:     attestation.Attestation,
	})
}

func setupAttestationFailure(status runtimesetup.AttestationStatus) (int, string, string) {
	switch status {
	case runtimesetup.AttestationNotFound:
		return http.StatusUnauthorized, "setup_attestation_not_found", "setup attestation seed was not found"
	case runtimesetup.AttestationExpired:
		return http.StatusUnauthorized, "setup_attestation_expired", "setup attestation seed has expired"
	case runtimesetup.AttestationReleaseMismatch:
		return http.StatusUnauthorized, "setup_attestation_release_mismatch", "setup attestation release does not match this runtime"
	case runtimesetup.AttestationReplayedNonce:
		return http.StatusUnauthorized, "setup_attestation_replayed_nonce", "setup attestation nonce has already been used"
	default:
		return http.StatusUnauthorized, "setup_attestation_unavailable", "setup attestation is not available"
	}
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
	if handler.localCredentialIssuer != nil {
		localDevices, err := handler.localCredentialIssuer.ListDeviceSessions(request.Context())
		if err != nil {
			writeError(response, http.StatusInternalServerError, "list_local_devices_failed", err.Error())
			return
		}
		devices = append(devices, localDevices...)
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
	device, ok, err := runtimeauth.DeviceSession{}, false, error(nil)
	if handler.localCredentialIssuer != nil {
		device, ok, err = handler.localCredentialIssuer.RevokeDeviceSession(request.Context(), payload.DeviceID)
	}
	if err == nil && !ok {
		device, ok, err = service.RevokeDeviceSession(request.Context(), payload.DeviceID)
	}
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

func requireRuntimeSetupService(response http.ResponseWriter, service RuntimeSetupService) RuntimeSetupService {
	if service == nil {
		writeError(response, http.StatusServiceUnavailable, "runtime_setup_service_unavailable", "runtime setup service is not available")
		return nil
	}
	return service
}

func validRuntimeIdentity(identity RuntimeIdentity) bool {
	return strings.TrimSpace(identity.ID) != "" && strings.TrimSpace(identity.DisplayName) != ""
}
