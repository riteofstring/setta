package auth

import "context"

type AuthSource string

const (
	AuthSourceBootstrap AuthSource = "bootstrap"
	AuthSourceCookie    AuthSource = "cookie"
)

type RequestInfo struct {
	SessionID string
	Session   SessionMetadata
	Source    AuthSource
}

type requestInfoContextKey struct{}

func ContextWithRequestInfo(ctx context.Context, info RequestInfo) context.Context {
	return context.WithValue(ctx, requestInfoContextKey{}, info)
}

func RequestInfoFromContext(ctx context.Context) (RequestInfo, bool) {
	info, ok := ctx.Value(requestInfoContextKey{}).(RequestInfo)
	return info, ok
}
