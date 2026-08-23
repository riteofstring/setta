package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

var ErrRuntimeSessionIdentityRequired = errors.New("httpapi: runtime session identity is required")

type runtimeSessionRoute struct {
	identity contracts.RuntimeSessionIdentityV2
}

func newRuntimeSessionRoute(options HandlerOptions) (*runtimeSessionRoute, error) {
	identity := options.RuntimeSession
	if identity == (contracts.RuntimeSessionIdentityV2{}) {
		return nil, ErrRuntimeSessionIdentityRequired
	}
	if err := identity.Validate(); err != nil {
		return nil, fmt.Errorf("httpapi: validate runtime session identity: %w", err)
	}
	return &runtimeSessionRoute{identity: identity}, nil
}

func (route *runtimeSessionRoute) dispatch(response http.ResponseWriter, request *http.Request) bool {
	if !isExactPath(request, contracts.RuntimeSessionPathV2) {
		return false
	}
	if !requireMethod(response, request, http.MethodGet) || !rejectQuery(response, request) || !rejectRequestBody(response, request) {
		return true
	}
	writeJSON(response, http.StatusOK, route.identity)
	return true
}
