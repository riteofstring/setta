package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"setta/internal/credissuer"
	"setta/internal/runtimeauth"
)

type authenticatedDeviceSessionKey struct{}
type authenticatedRuntimeSessionKey struct{}

type authenticatedRuntimeSession struct {
	deviceSession           *runtimeauth.DeviceSession
	runtimeAccessCredential *credissuer.VerifiedCredential
}

func authenticatedDeviceSession(request *http.Request) (runtimeauth.DeviceSession, bool) {
	session, ok := request.Context().Value(authenticatedDeviceSessionKey{}).(runtimeauth.DeviceSession)
	if ok {
		return session, true
	}
	authSession, ok := request.Context().Value(authenticatedRuntimeSessionKey{}).(authenticatedRuntimeSession)
	if !ok || authSession.runtimeAccessCredential == nil {
		return runtimeauth.DeviceSession{}, false
	}
	return runtimeauth.DeviceSession{
		ID:    authSession.runtimeAccessCredential.Claims.DeviceID,
		Scope: runtimeauth.DeviceScopeFull,
	}, true
}

func (handler handler) dispatch(route endpoint, response http.ResponseWriter, request *http.Request) {
	if route.Unauthenticated {
		route.Handler(handler, response, request)
		return
	}
	session, ok := handler.authenticateRequest(response, request)
	if !ok {
		return
	}
	request = request.WithContext(context.WithValue(
		request.Context(),
		authenticatedRuntimeSessionKey{},
		session,
	))
	if session.deviceSession != nil {
		request = request.WithContext(context.WithValue(
			request.Context(),
			authenticatedDeviceSessionKey{},
			*session.deviceSession,
		))
	}
	if route.Streaming {
		request = handler.withConnectionRevalidation(request, session)
	}
	route.Handler(handler, response, request)
}

func (handler handler) authenticateRequest(
	response http.ResponseWriter,
	request *http.Request,
) (authenticatedRuntimeSession, bool) {
	token, ok := bearerToken(request.Header.Get("Authorization"))
	if !ok {
		writeUnauthorized(response)
		return authenticatedRuntimeSession{}, false
	}
	if handler.runtimeAccessService != nil {
		if session, handled := handler.authenticateRuntimeAccessCredential(response, request, token); handled {
			return session.session, session.ok
		}
	}
	if handler.runtimeAuthService == nil && handler.runtimeAccessService != nil {
		writeUnauthorized(response)
		return authenticatedRuntimeSession{}, false
	}
	service := requireRuntimeAuthService(response, handler.runtimeAuthService)
	if service == nil {
		return authenticatedRuntimeSession{}, false
	}
	return authenticateLegacyDeviceSession(response, request, service, token)
}

type authenticationResult struct {
	session authenticatedRuntimeSession
	ok      bool
}

func (handler handler) authenticateRuntimeAccessCredential(
	response http.ResponseWriter,
	request *http.Request,
	token string,
) (authenticationResult, bool) {
	credential, ok, err := handler.runtimeAccessService.VerifyRuntimeAccessCredential(request.Context(), token)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "verify_runtime_access_credential_failed", err.Error())
		return authenticationResult{}, true
	}
	if ok {
		return authenticationResult{
			session: authenticatedRuntimeSession{runtimeAccessCredential: &credential},
			ok:      true,
		}, true
	}
	return authenticationResult{}, false
}

func authenticateLegacyDeviceSession(
	response http.ResponseWriter,
	request *http.Request,
	service RuntimeAuthService,
	token string,
) (authenticatedRuntimeSession, bool) {
	session, ok, err := service.ResolveDeviceToken(request.Context(), token)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "resolve_device_token_failed", err.Error())
		return authenticatedRuntimeSession{}, false
	}
	if !ok {
		writeUnauthorized(response)
		return authenticatedRuntimeSession{}, false
	}
	touched, err := service.TouchDeviceSession(request.Context(), session.ID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "touch_device_session_failed", err.Error())
		return authenticatedRuntimeSession{}, false
	}
	if !touched {
		writeUnauthorized(response)
		return authenticatedRuntimeSession{}, false
	}
	return authenticatedRuntimeSession{deviceSession: &session}, true
}

func (handler handler) withConnectionRevalidation(
	request *http.Request,
	session authenticatedRuntimeSession,
) *http.Request {
	ctx, cancel := context.WithCancel(request.Context())
	go handler.cancelWhenAuthenticationInvalid(ctx, cancel, session)
	return request.WithContext(ctx)
}

func (handler handler) cancelWhenAuthenticationInvalid(
	ctx context.Context,
	cancel context.CancelFunc,
	session authenticatedRuntimeSession,
) {
	ticker := time.NewTicker(handler.revocationSweepInterval)
	defer ticker.Stop()
	defer cancel()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			valid, err := handler.revalidateAuthenticatedSession(context.Background(), session)
			if err != nil || !valid {
				return
			}
		}
	}
}

func (handler handler) revalidateAuthenticatedSession(
	ctx context.Context,
	session authenticatedRuntimeSession,
) (bool, error) {
	if session.runtimeAccessCredential != nil {
		if handler.runtimeAccessService == nil {
			return false, nil
		}
		return handler.runtimeAccessService.RevalidateRuntimeAccessCredential(ctx, *session.runtimeAccessCredential)
	}
	if session.deviceSession != nil {
		if handler.runtimeAuthService == nil {
			return false, nil
		}
		revoked, err := handler.runtimeAuthService.IsDeviceSessionRevoked(ctx, session.deviceSession.ID)
		if err != nil || revoked {
			return false, err
		}
		return true, nil
	}
	return false, nil
}

func bearerToken(header string) (string, bool) {
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok || token == "" || strings.ContainsAny(token, " \t\r\n") {
		return "", false
	}
	return token, true
}

func writeUnauthorized(response http.ResponseWriter) {
	writeError(response, http.StatusUnauthorized, "unauthorized", "missing or invalid runtime credential")
}
