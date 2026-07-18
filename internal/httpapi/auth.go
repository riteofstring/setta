package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"setta/internal/runtimeauth"
)

type authenticatedDeviceSessionKey struct{}

func authenticatedDeviceSession(request *http.Request) (runtimeauth.DeviceSession, bool) {
	session, ok := request.Context().Value(authenticatedDeviceSessionKey{}).(runtimeauth.DeviceSession)
	return session, ok
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
		authenticatedDeviceSessionKey{},
		session,
	))
	if route.Streaming {
		request = handler.withRevocationSweep(request, session)
	}
	route.Handler(handler, response, request)
}

func (handler handler) authenticateRequest(
	response http.ResponseWriter,
	request *http.Request,
) (runtimeauth.DeviceSession, bool) {
	service := requireRuntimeAuthService(response, handler.runtimeAuthService)
	if service == nil {
		return runtimeauth.DeviceSession{}, false
	}
	token, ok := bearerToken(request.Header.Get("Authorization"))
	if !ok {
		writeUnauthorized(response)
		return runtimeauth.DeviceSession{}, false
	}
	session, ok, err := service.ResolveDeviceToken(request.Context(), token)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "resolve_device_token_failed", err.Error())
		return runtimeauth.DeviceSession{}, false
	}
	if !ok {
		writeUnauthorized(response)
		return runtimeauth.DeviceSession{}, false
	}
	touched, err := service.TouchDeviceSession(request.Context(), session.ID)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "touch_device_session_failed", err.Error())
		return runtimeauth.DeviceSession{}, false
	}
	if !touched {
		writeUnauthorized(response)
		return runtimeauth.DeviceSession{}, false
	}
	return session, true
}

func (handler handler) withRevocationSweep(
	request *http.Request,
	session runtimeauth.DeviceSession,
) *http.Request {
	ctx, cancel := context.WithCancel(request.Context())
	go handler.cancelWhenRevoked(ctx, cancel, session.ID)
	return request.WithContext(ctx)
}

func (handler handler) cancelWhenRevoked(
	ctx context.Context,
	cancel context.CancelFunc,
	deviceID string,
) {
	ticker := time.NewTicker(handler.revocationSweepInterval)
	defer ticker.Stop()
	defer cancel()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			revoked, err := handler.runtimeAuthService.IsDeviceSessionRevoked(context.Background(), deviceID)
			if err != nil || revoked {
				return
			}
		}
	}
}

func bearerToken(header string) (string, bool) {
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok || token == "" || strings.ContainsAny(token, " \t\r\n") {
		return "", false
	}
	return token, true
}

func writeUnauthorized(response http.ResponseWriter) {
	writeError(response, http.StatusUnauthorized, "unauthorized", "missing or invalid device token")
}
