package modes

import (
	"context"
	"errors"
	"net/http"
)

type RequestInfo struct {
	Policy         Policy
	ShareSessionID string
}

type requestInfoContextKey struct{}

var ErrMissingRequestInfo = errors.New("missing request mode info")

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
