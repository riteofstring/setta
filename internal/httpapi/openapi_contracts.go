package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"reflect"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
)

type openAPINoBody struct{}
type openAPIJSONNull struct{}

var (
	openAPINoBodyType   = reflect.TypeOf(openAPINoBody{})
	openAPIJSONNullType = reflect.TypeOf(openAPIJSONNull{})
	errorResponseType   = reflect.TypeOf(errorResponse{})
)

type openAPIOperation struct {
	OperationID         string
	Method              string
	Path                string
	Tags                []string
	Summary             string
	AuthRequirement     string
	ModeRequirement     string
	PathParamsType      reflect.Type
	QueryParamsType     reflect.Type
	RequestType         reflect.Type
	ResponseType        reflect.Type
	RequestContentType  string
	ResponseContentType string
}

type openAPIOperationOption func(*openAPIOperation)

type openAPIRouter interface {
	chi.Router
	OpenAPICollector() *openAPICollector
}

type contractRouter struct {
	chi.Router
	collector *openAPICollector
}

type openAPICollector struct {
	document          *huma.OpenAPI
	operationIDs      map[string]struct{}
	operationMethods  map[string]struct{}
	defaultErrorReply *huma.Response
}

func newOpenAPIDocument() *huma.OpenAPI {
	return &huma.OpenAPI{
		OpenAPI:           "3.1.0",
		JSONSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
		Info: &huma.Info{
			Title:   "Setta HTTP API",
			Version: "0.0.0-dev",
		},
		Servers: []*huma.Server{{
			URL: "/api",
		}},
		Components: &huma.Components{
			Schemas: huma.NewMapRegistry("#/components/schemas/", settaOpenAPISchemaName),
		},
		Extensions: map[string]any{
			"x-setta-contract-source": "explicit-typed-route-registration",
		},
	}
}

func newOpenAPICollector(document *huma.OpenAPI) *openAPICollector {
	if document == nil {
		panic("openapi collector requires a document")
	}
	if document.Components == nil {
		document.Components = &huma.Components{
			Schemas: huma.NewMapRegistry("#/components/schemas/", settaOpenAPISchemaName),
		}
	}
	if document.Components.Schemas == nil {
		document.Components.Schemas = huma.NewMapRegistry("#/components/schemas/", settaOpenAPISchemaName)
	}
	return &openAPICollector{
		document:         document,
		operationIDs:     make(map[string]struct{}),
		operationMethods: make(map[string]struct{}),
	}
}

func wrapRouterWithOpenAPI(router chi.Router, document *huma.OpenAPI) chi.Router {
	return wrapOpenAPIRouter(router, newOpenAPICollector(document))
}

func wrapOpenAPIRouter(router chi.Router, collector *openAPICollector) chi.Router {
	if router == nil || collector == nil {
		return router
	}
	if existing, ok := router.(openAPIRouter); ok && existing.OpenAPICollector() == collector {
		return router
	}
	return &contractRouter{
		Router:    router,
		collector: collector,
	}
}

func (r *contractRouter) OpenAPICollector() *openAPICollector {
	return r.collector
}

func (r *contractRouter) With(middlewares ...func(http.Handler) http.Handler) chi.Router {
	return wrapOpenAPIRouter(r.Router.With(middlewares...), r.collector)
}

func (r *contractRouter) Group(fn func(chi.Router)) chi.Router {
	return r.Router.Group(func(inner chi.Router) {
		fn(wrapOpenAPIRouter(inner, r.collector))
	})
}

func (r *contractRouter) Route(pattern string, fn func(chi.Router)) chi.Router {
	return r.Router.Route(pattern, func(inner chi.Router) {
		fn(wrapOpenAPIRouter(inner, r.collector))
	})
}

func withOpenAPITags(tags ...string) openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.Tags = append(operation.Tags, tags...)
	}
}

func withOpenAPISummary(summary string) openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.Summary = strings.TrimSpace(summary)
	}
}

func withOpenAPIAuthRequirement(requirement string) openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.AuthRequirement = strings.TrimSpace(requirement)
	}
}

func withOpenAPIModeRequirement(requirement string) openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.ModeRequirement = strings.TrimSpace(requirement)
	}
}

func withOpenAPIRequestContentType(contentType string) openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.RequestContentType = strings.TrimSpace(contentType)
	}
}

func withOpenAPIResponseContentType(contentType string) openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.ResponseContentType = strings.TrimSpace(contentType)
	}
}

func withOpenAPIPathParams[T any]() openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.PathParamsType = openAPIReflectType[T]()
	}
}

func withOpenAPIQuery[T any]() openAPIOperationOption {
	return func(operation *openAPIOperation) {
		operation.QueryParamsType = openAPIReflectType[T]()
	}
}

func registerOpenAPIGet[Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	registerOpenAPIOperation[openAPINoBody, Resp](
		router,
		http.MethodGet,
		operationID,
		routePath,
		handler,
		options...,
	)
}

func registerOpenAPIPostNoRequest[Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	registerOpenAPIOperation[openAPINoBody, Resp](
		router,
		http.MethodPost,
		operationID,
		routePath,
		handler,
		options...,
	)
}

func registerOpenAPIPost[Req, Resp any](
	router chi.Router,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	registerOpenAPIOperation[Req, Resp](
		router,
		http.MethodPost,
		operationID,
		routePath,
		handler,
		options...,
	)
}

func registerOpenAPIOperation[Req, Resp any](
	router chi.Router,
	method string,
	operationID string,
	routePath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	registerOpenAPIOperationAtPaths[Req, Resp](
		router,
		method,
		operationID,
		routePath,
		routePath,
		handler,
		options...,
	)
}

func registerOpenAPIOperationAtPaths[Req, Resp any](
	router chi.Router,
	method string,
	operationID string,
	runtimePath string,
	documentPath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	router.MethodFunc(method, runtimePath, handler)

	collector := openAPICollectorFromRouter(router)
	if collector == nil {
		return
	}

	operation := openAPIOperation{
		OperationID:         strings.TrimSpace(operationID),
		Method:              method,
		Path:                strings.TrimSpace(documentPath),
		AuthRequirement:     "auth-cookie-when-enabled",
		RequestType:         normalizeOpenAPIType(openAPIReflectType[Req]()),
		ResponseType:        normalizeOpenAPIType(openAPIReflectType[Resp]()),
		RequestContentType:  "application/json",
		ResponseContentType: "application/json",
	}
	for _, option := range options {
		option(&operation)
	}
	if operation.RequestType == nil {
		operation.RequestContentType = ""
	}
	if operation.ResponseType == nil {
		operation.ResponseContentType = ""
	}
	collector.AddOperation(operation)
}

func openAPICollectorFromRouter(router chi.Router) *openAPICollector {
	if router == nil {
		return nil
	}
	if wrapped, ok := router.(openAPIRouter); ok {
		return wrapped.OpenAPICollector()
	}
	return nil
}

func routerWithoutOpenAPI(router chi.Router) chi.Router {
	if router == nil {
		return nil
	}
	if wrapped, ok := router.(*contractRouter); ok {
		return wrapped.Router
	}
	return router
}

func (c *openAPICollector) AddOperation(operation openAPIOperation) {
	if strings.TrimSpace(operation.OperationID) == "" {
		panic("openapi operation id is required")
	}
	if strings.TrimSpace(operation.Path) == "" {
		panic(fmt.Sprintf("openapi operation %s requires a path", operation.OperationID))
	}
	methodKey := operation.Method + "\x00" + operation.Path
	if _, exists := c.operationMethods[methodKey]; exists {
		panic(fmt.Sprintf("duplicate openapi operation registration for %s %s", operation.Method, operation.Path))
	}
	c.operationMethods[methodKey] = struct{}{}
	if _, exists := c.operationIDs[operation.OperationID]; exists {
		panic(fmt.Sprintf("duplicate openapi operation id %q", operation.OperationID))
	}
	c.operationIDs[operation.OperationID] = struct{}{}

	openAPIOperation := &huma.Operation{
		Method:      operation.Method,
		Path:        operation.Path,
		OperationID: operation.OperationID,
		Tags:        append([]string(nil), operation.Tags...),
		Summary:     operation.Summary,
		Parameters:  c.buildParameters(operation.Path, operation.PathParamsType, operation.QueryParamsType, operation.OperationID),
		Responses: map[string]*huma.Response{
			"200": c.buildSuccessResponse(operation.ResponseType, operation.ResponseContentType),
		},
		Extensions: c.operationExtensions(operation),
	}
	if body := c.buildRequestBody(operation.RequestType, operation.RequestContentType); body != nil {
		openAPIOperation.RequestBody = body
	}
	if defaultResponse := c.defaultErrorResponse(); defaultResponse != nil {
		openAPIOperation.Responses["default"] = defaultResponse
	}

	c.document.AddOperation(openAPIOperation)
}

func (c *openAPICollector) operationExtensions(operation openAPIOperation) map[string]any {
	extensions := map[string]any{
		"x-setta-auth-requirement": operation.AuthRequirement,
	}
	if operation.ModeRequirement != "" {
		extensions["x-setta-mode-requirement"] = operation.ModeRequirement
	}
	return extensions
}

func (c *openAPICollector) buildRequestBody(requestType reflect.Type, contentType string) *huma.RequestBody {
	schema := c.schemaForType(requestType)
	if schema == nil {
		return nil
	}
	return &huma.RequestBody{
		Required: true,
		Content: map[string]*huma.MediaType{
			contentType: {
				Schema: schema,
			},
		},
	}
}

func (c *openAPICollector) buildSuccessResponse(responseType reflect.Type, contentType string) *huma.Response {
	response := &huma.Response{
		Description: "OK",
	}
	schema := c.schemaForType(responseType)
	if schema == nil {
		return response
	}
	response.Content = map[string]*huma.MediaType{
		contentType: {
			Schema: schema,
		},
	}
	return response
}

func (c *openAPICollector) defaultErrorResponse() *huma.Response {
	if c.defaultErrorReply != nil {
		return c.defaultErrorReply
	}
	c.defaultErrorReply = &huma.Response{
		Description: "Error",
		Content: map[string]*huma.MediaType{
			"application/json": {
				Schema: c.document.Components.Schemas.Schema(errorResponseType, true, "HTTPAPIErrorResponse"),
			},
		},
	}
	return c.defaultErrorReply
}

func (c *openAPICollector) buildParameters(
	routePath string,
	pathParamsType reflect.Type,
	queryParamsType reflect.Type,
	operationID string,
) []*huma.Param {
	pathParams := c.buildPathParameters(routePath, pathParamsType, operationID)
	queryParams := c.buildQueryParameters(queryParamsType, operationID)
	if len(pathParams) == 0 {
		return queryParams
	}
	if len(queryParams) == 0 {
		return pathParams
	}
	return append(pathParams, queryParams...)
}

func (c *openAPICollector) buildPathParameters(
	routePath string,
	pathParamsType reflect.Type,
	operationID string,
) []*huma.Param {
	paramNames := openAPIPathParamNames(routePath)
	if len(paramNames) == 0 {
		return nil
	}
	fields := openAPIPathParamFields(pathParamsType, operationID)
	fieldsByName := make(map[string]reflect.Type, len(fields))
	for name, fieldType := range fields {
		fieldsByName[name] = fieldType
	}

	params := make([]*huma.Param, 0, len(paramNames))
	for _, paramName := range paramNames {
		fieldType, ok := fieldsByName[paramName]
		if !ok {
			panic(fmt.Sprintf("openapi operation %s path param %q has no declared type", operationID, paramName))
		}
		params = append(params, &huma.Param{
			Name:     paramName,
			In:       "path",
			Required: true,
			Schema:   c.schemaForType(openAPIParameterType(fieldType)),
		})
	}
	return params
}

func (c *openAPICollector) buildQueryParameters(
	queryParamsType reflect.Type,
	operationID string,
) []*huma.Param {
	fields := openAPIParameterFields(queryParamsType, operationID, "query")
	if len(fields) == 0 {
		return nil
	}

	params := make([]*huma.Param, 0, len(fields))
	for _, field := range fields {
		params = append(params, &huma.Param{
			Name:     field.Name,
			In:       "query",
			Required: field.Required,
			Schema:   c.schemaForType(openAPIParameterType(field.Type)),
		})
	}
	return params
}

func (c *openAPICollector) schemaForType(t reflect.Type) *huma.Schema {
	t = normalizeOpenAPIType(t)
	if t == nil {
		return nil
	}
	if t == openAPIJSONNullType {
		return &huma.Schema{Type: "null"}
	}
	return c.document.Components.Schemas.Schema(t, true, huma.DefaultSchemaNamer(t, ""))
}

func openAPIReflectType[T any]() reflect.Type {
	return reflect.TypeOf((*T)(nil)).Elem()
}

func normalizeOpenAPIType(t reflect.Type) reflect.Type {
	if t == nil || t == openAPINoBodyType {
		return nil
	}
	return t
}

func openAPIParameterType(t reflect.Type) reflect.Type {
	return openAPIConcreteType(normalizeOpenAPIType(t))
}

type openAPIParameterField struct {
	Name     string
	Type     reflect.Type
	Required bool
}

func openAPIPathParamFields(t reflect.Type, operationID string) map[string]reflect.Type {
	if t == nil {
		panic(fmt.Sprintf("openapi operation %s requires a path params type", operationID))
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		panic(fmt.Sprintf("openapi operation %s path params type must be a struct, got %s", operationID, t))
	}

	fields := make(map[string]reflect.Type, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, skip := openAPIJSONFieldName(field)
		if skip {
			continue
		}
		fields[name] = field.Type
	}
	if len(fields) == 0 {
		panic(fmt.Sprintf("openapi operation %s path params type %s has no exported json fields", operationID, t))
	}
	return fields
}

func openAPIParameterFields(
	t reflect.Type,
	operationID string,
	parameterKind string,
) []openAPIParameterField {
	if t == nil {
		return nil
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		panic(fmt.Sprintf("openapi operation %s %s params type must be a struct, got %s", operationID, parameterKind, t))
	}

	fields := make([]openAPIParameterField, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, options, skip := openAPIJSONField(field)
		if skip {
			continue
		}
		required := !options.Omitempty && !options.Omitzero && field.Type.Kind() != reflect.Pointer
		fields = append(fields, openAPIParameterField{
			Name:     name,
			Type:     field.Type,
			Required: required,
		})
	}
	if len(fields) == 0 {
		panic(fmt.Sprintf("openapi operation %s %s params type %s has no exported json fields", operationID, parameterKind, t))
	}
	return fields
}

type openAPIJSONFieldOptions struct {
	Omitempty bool
	Omitzero  bool
}

func openAPIJSONFieldName(field reflect.StructField) (string, bool) {
	name, _, skip := openAPIJSONField(field)
	return name, skip
}

func openAPIJSONField(field reflect.StructField) (string, openAPIJSONFieldOptions, bool) {
	tag := strings.TrimSpace(field.Tag.Get("json"))
	if tag == "-" {
		return "", openAPIJSONFieldOptions{}, true
	}
	options := openAPIJSONFieldOptions{}
	if tag == "" {
		return field.Name, options, false
	}
	name, remainder, _ := strings.Cut(tag, ",")
	name = strings.TrimSpace(name)
	for _, option := range strings.Split(remainder, ",") {
		switch strings.TrimSpace(option) {
		case "omitempty":
			options.Omitempty = true
		case "omitzero":
			options.Omitzero = true
		}
	}
	if name == "" {
		return field.Name, options, false
	}
	return name, options, false
}

func openAPIPathParamNames(routePath string) []string {
	names := make([]string, 0, 4)
	for {
		start := strings.IndexByte(routePath, '{')
		if start < 0 {
			return names
		}
		routePath = routePath[start+1:]
		end := strings.IndexByte(routePath, '}')
		if end < 0 {
			return names
		}
		name := strings.TrimSpace(routePath[:end])
		if name != "" {
			names = append(names, name)
		}
		routePath = routePath[end+1:]
	}
}

func settaOpenAPISchemaName(t reflect.Type, hint string) string {
	name := huma.DefaultSchemaNamer(t, hint)
	t = openAPIConcreteType(t)
	if t == nil {
		return name
	}
	pkgPath := strings.TrimSpace(t.PkgPath())
	if pkgPath == "" {
		return name
	}
	trimmedPkg := strings.TrimPrefix(pkgPath, "setta/")
	segments := strings.Split(trimmedPkg, "/")
	var builder strings.Builder
	for _, segment := range segments {
		segment = strings.TrimSpace(segment)
		if segment == "" || segment == "internal" {
			continue
		}
		builder.WriteString(exportSchemaSegment(segment))
	}
	builder.WriteString(name)
	return builder.String()
}

func openAPIConcreteType(t reflect.Type) reflect.Type {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t
}

func exportSchemaSegment(segment string) string {
	base := path.Base(strings.TrimSpace(segment))
	if base == "." || base == "/" || base == "" {
		return ""
	}
	base = strings.ReplaceAll(base, "-", " ")
	base = strings.ReplaceAll(base, "_", " ")
	parts := strings.Fields(base)
	var builder strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		builder.WriteString(strings.ToUpper(part[:1]))
		if len(part) > 1 {
			builder.WriteString(part[1:])
		}
	}
	return builder.String()
}

func openAPIDocumentHandler(document *huma.OpenAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := json.Marshal(document)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
	}
}
