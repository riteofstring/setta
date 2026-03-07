package auth

import (
	"context"
	"errors"
	"net/http"
	"time"
)

type AuthSource string

const (
	AuthSourceBootstrap AuthSource = "bootstrap"
	AuthSourceCookie    AuthSource = "cookie"
)

type RequestInfo struct {
	SessionID string
	Session   SessionMetadata
	Source    AuthSource
	ExpiresAt time.Time
}

type requestInfoContextKey struct{}

var ErrMissingRequestInfo = errors.New("missing request auth info")

func ContextWithRequestInfo(ctx context.Context, info RequestInfo) context.Context {
	return context.WithValue(ctx, requestInfoContextKey{}, info)
}

func RequestInfoFromContext(ctx context.Context) (RequestInfo, bool) {
	info, ok := ctx.Value(requestInfoContextKey{}).(RequestInfo)
	return info, ok
}

func RequestInfoFromRequest(r *http.Request) (RequestInfo, bool) {
	if r == nil {
		return RequestInfo{}, false
	}
	return RequestInfoFromContext(r.Context())
}

func RequireRequestInfo(r *http.Request) (RequestInfo, error) {
	info, ok := RequestInfoFromRequest(r)
	if !ok {
		return RequestInfo{}, ErrMissingRequestInfo
	}
	return info, nil
}
