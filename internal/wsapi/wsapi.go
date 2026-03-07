package wsapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"setta/internal/auth"
	"setta/internal/modes"
)

const (
	CloseCodeBadRequest   websocket.StatusCode = 4400
	CloseCodeUnauthorized websocket.StatusCode = 4401
	CloseCodeForbidden    websocket.StatusCode = 4403
	CloseCodeNotFound     websocket.StatusCode = 4404
)

type Dependencies struct {
	Auth          *auth.Service
	ModePolicy    modes.Policy
	ShareSessions modes.ShareSessionStore
	AcceptOptions *websocket.AcceptOptions
}

type ConnectionInfo struct {
	Auth    auth.RequestInfo
	HasAuth bool
	Modes   modes.RequestInfo
}

type CloseError struct {
	Code   websocket.StatusCode
	Reason string
}

func (e *CloseError) Error() string {
	return e.Reason
}

type Handler func(context.Context, *websocket.Conn, ConnectionInfo) error

func AuthenticatedHandler(deps Dependencies, handler Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, deps.AcceptOptions)
		if err != nil {
			return
		}

		connectionInfo, err := ResolveConnection(r, deps, time.Now().UTC())
		if err != nil {
			var closeErr *CloseError
			if errors.As(err, &closeErr) {
				_ = conn.Close(closeErr.Code, closeErr.Reason)
				return
			}
			_ = conn.Close(websocket.StatusInternalError, "Internal Server Error")
			return
		}

		ctx := modes.ContextWithRequestInfo(r.Context(), connectionInfo.Modes)
		if connectionInfo.HasAuth {
			ctx = auth.ContextWithRequestInfo(ctx, connectionInfo.Auth)
		}

		if err := handler(ctx, conn, connectionInfo); err != nil {
			var closeErr *CloseError
			if errors.As(err, &closeErr) {
				_ = conn.Close(closeErr.Code, closeErr.Reason)
				return
			}
			_ = conn.Close(websocket.StatusInternalError, "Internal Server Error")
		}
	}
}

func ResolveConnection(r *http.Request, deps Dependencies, now time.Time) (ConnectionInfo, error) {
	modePolicy := modes.NewPolicy(deps.ModePolicy.Mode())
	modeInfo, err := (modes.Resolver{
		Policy: modePolicy,
		Store:  deps.ShareSessions,
	}).ResolveRequest(r)
	if err != nil {
		return ConnectionInfo{}, mapModesError(err)
	}

	info := ConnectionInfo{
		Modes: modeInfo,
	}
	if modePolicy.IsDeployment() {
		return info, nil
	}
	if deps.Auth == nil || !deps.Auth.SupportsSessionAuth() {
		return ConnectionInfo{}, unauthorized("Unauthorized.")
	}

	if cookieValue, ok := deps.Auth.ReadAuthCookie(r); ok {
		authInfo, err := deps.Auth.ValidateAuthCookie(cookieValue, now)
		if err == nil {
			info.Auth = authInfo
			info.HasAuth = true
			return info, nil
		}
	}

	bearerToken := auth.ExtractBearerToken(r.Header)
	if bearerToken != "" {
		authInfo, err := deps.Auth.ConsumeBootstrapToken(bearerToken, now)
		if err == nil {
			info.Auth = authInfo
			info.HasAuth = true
			return info, nil
		}
	}

	return ConnectionInfo{}, unauthorized("Unauthorized.")
}

func unauthorized(reason string) *CloseError {
	return &CloseError{
		Code:   CloseCodeUnauthorized,
		Reason: reason,
	}
}

func mapModesError(err error) error {
	var missingShareSession *modes.MissingShareSessionError
	if errors.As(err, &missingShareSession) {
		return &CloseError{
			Code:   CloseCodeBadRequest,
			Reason: missingShareSession.Error(),
		}
	}

	var unknownShareSession *modes.UnknownShareSessionError
	if errors.As(err, &unknownShareSession) {
		return &CloseError{
			Code:   CloseCodeNotFound,
			Reason: unknownShareSession.Error(),
		}
	}

	var violation *modes.Violation
	if errors.As(err, &violation) {
		return &CloseError{
			Code:   CloseCodeForbidden,
			Reason: violation.Message,
		}
	}

	return err
}
