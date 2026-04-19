package httpapi

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type OpenAPIOperationOption = openAPIOperationOption

func WithOpenAPITags(tags ...string) OpenAPIOperationOption {
	return withOpenAPITags(tags...)
}

func WithOpenAPISummary(summary string) OpenAPIOperationOption {
	return withOpenAPISummary(summary)
}

func WithOpenAPIModeRequirement(requirement string) OpenAPIOperationOption {
	return withOpenAPIModeRequirement(requirement)
}

func WithOpenAPIRequestContentType(contentType string) OpenAPIOperationOption {
	return withOpenAPIRequestContentType(contentType)
}

func WithOpenAPIResponseContentType(contentType string) OpenAPIOperationOption {
	return withOpenAPIResponseContentType(contentType)
}

func WithOpenAPIPathParams[T any]() OpenAPIOperationOption {
	return withOpenAPIPathParams[T]()
}

func WithOpenAPIQuery[T any]() OpenAPIOperationOption {
	return withOpenAPIQuery[T]()
}

func RegisterOpenAPIGet[Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...OpenAPIOperationOption,
) {
	registerOpenAPIGet[Resp](router, operationID, routePath, handler, options...)
}

func RegisterOpenAPIPostNoRequest[Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...OpenAPIOperationOption,
) {
	registerOpenAPIPostNoRequest[Resp](router, operationID, routePath, handler, options...)
}

func RegisterOpenAPIPost[Req, Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...OpenAPIOperationOption,
) {
	registerOpenAPIPost[Req, Resp](router, operationID, routePath, handler, options...)
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	writeJSON(w, status, payload)
}

func WriteError(w http.ResponseWriter, r *http.Request, status int, code string, message string) {
	writeError(w, r, status, code, message)
}

func WriteDetail(w http.ResponseWriter, status int, detail any) {
	writeDetail(w, status, detail)
}

func WriteValidationError(w http.ResponseWriter, status int, message string) {
	writeValidationError(w, status, message)
}

func DecodeJSONBody[T any](r *http.Request) (T, error) {
	return decodeJSONBody[T](r)
}

func ProjectMutationContext(ctx context.Context, frontendOpID *string) context.Context {
	return projectMutationContext(ctx, frontendOpID)
}
