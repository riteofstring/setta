package modes

import (
	"fmt"
	"net/http"
	"strings"
)

const (
	ShareSessionHeaderName = "X-Share-Session-Id"
	ShareSessionCookieName = "shareSessionId"
	ShareSessionQueryName  = "shareSessionId"
)

type ShareSessionStore interface {
	HasSession(sessionID string) bool
	TouchSession(sessionID string) error
}

type MissingShareSessionError struct{}

func (e *MissingShareSessionError) Error() string {
	return "Missing share session id."
}

type UnknownShareSessionError struct {
	SessionID string
}

func (e *UnknownShareSessionError) Error() string {
	return fmt.Sprintf("Unknown share session id: %s", e.SessionID)
}

type Resolver struct {
	Policy Policy
	Store  ShareSessionStore
}

func (r Resolver) ResolveRequest(req *http.Request) (RequestInfo, error) {
	requestInfo, ok := RequestInfoFromRequest(req)
	if !ok {
		requestInfo = RequestInfo{Policy: r.Policy}
	} else {
		requestInfo.Policy = r.Policy
	}

	if !r.Policy.IsDeployment() {
		return requestInfo, nil
	}

	sessionID := MaybeShareSessionIDFromRequest(req)
	if sessionID == "" {
		return RequestInfo{}, &MissingShareSessionError{}
	}
	if r.Store == nil || !r.Store.HasSession(sessionID) {
		return RequestInfo{}, &UnknownShareSessionError{SessionID: sessionID}
	}
	if err := r.Store.TouchSession(sessionID); err != nil {
		return RequestInfo{}, fmt.Errorf("touch share session %q: %w", sessionID, err)
	}

	requestInfo.ShareSessionID = sessionID
	return requestInfo, nil
}

func MaybeShareSessionIDFromRequest(req *http.Request) string {
	if req == nil {
		return ""
	}

	if headerValue := trimmed(req.Header.Get(ShareSessionHeaderName)); headerValue != "" {
		return headerValue
	}
	if cookie, err := req.Cookie(ShareSessionCookieName); err == nil {
		if cookieValue := trimmed(cookie.Value); cookieValue != "" {
			return cookieValue
		}
	}
	if queryValue := trimmed(req.URL.Query().Get(ShareSessionQueryName)); queryValue != "" {
		return queryValue
	}
	return ""
}

func trimmed(value string) string {
	return strings.TrimSpace(value)
}
