package frontendbindings

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"

	"setta/internal/httpapi"
)

const (
	sourcePackageFrontendBindings = "setta/internal/frontendbindings"
	sourcePackageHTTPAPI          = "setta/internal/httpapi"
)

type sourceTypeRef struct {
	PkgPath string
	Name    string
	Builtin string
	Pointer bool

	Container string
	Elem      *sourceTypeRef
}

type sourceValueEnv map[string]sourceTypeRef

type sourcePackageIndex struct {
	importPath string
	dir        string
	fset       *token.FileSet
	files      []*ast.File
	funcs      map[string]*ast.FuncDecl
	methods    map[string]map[string]*ast.FuncDecl
	types      map[string]*ast.TypeSpec
}

type sourceFileContext struct {
	pkg     *sourcePackageIndex
	file    *ast.File
	imports map[string]string
}

type sourceResolver struct {
	repoRoot string
	packages map[string]*sourcePackageIndex
}

type discoveredRouteEndpoint struct {
	Method        string
	RouteConst    string
	HandlerName   string
	RequestType   reflect.Type
	PathParams    reflect.Type
	ResponseType  reflect.Type
	Binary        bool
	EnclosingFunc *ast.FuncDecl
	HandlerExpr   ast.Expr
	File          *ast.File
}

type discoveredHandlerSpec struct {
	RequestType  sourceTypeRef
	ResponseType sourceTypeRef
	Binary       bool
}

type namedTypeRegistry struct {
	byQualified map[string]reflect.Type
	byName      map[string][]reflect.Type
}

var endpointRequestTypeOverrides = map[string]reflect.Type{
	"POST RouteBinaryUpload":  reflect.TypeOf(httpapi.BinaryUploadRequest{}),
	"GET RouteBinaryDownload": reflect.TypeOf(httpapi.BinaryDownloadRequest{}),
}

var endpointResponseTypeOverrides = map[string]reflect.Type{
	"GET RouteBinaryDownload": reflect.TypeOf(httpapi.BinaryDownloadResponse{}),
}

func CurrentEndpoints() []EndpointSpec {
	specs, err := discoverCurrentEndpoints()
	if err != nil {
		panic(err)
	}
	return specs
}

func discoverCurrentEndpoints() ([]EndpointSpec, error) {
	resolver, err := newSourceResolver()
	if err != nil {
		return nil, err
	}
	httpPkg, err := resolver.loadPackage(sourcePackageHTTPAPI)
	if err != nil {
		return nil, err
	}

	registry := newNamedTypeRegistry()
	routePaths := httpRouteConstPaths()

	discovered := make([]discoveredRouteEndpoint, 0, 256)
	for _, fn := range httpPkg.funcs {
		if !strings.HasPrefix(fn.Name.Name, "Register") && fn.Name.Name != "NewHandler" {
			continue
		}
		file := resolver.fileForDecl(httpPkg, fn)
		if file == nil {
			continue
		}
		ctx := resolver.fileContext(httpPkg, file)
		ast.Inspect(fn.Body, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			method, routeConst, handlerExpr, ok := routeRegistrationCall(call)
			if !ok {
				return true
			}
			routePath, ok := routePaths[routeConst]
			if !ok {
				return true
			}
			if !includeHTTPRouteConstant(routeConst, routePath) {
				return true
			}

			handlerName := handlerNameFromExpr(handlerExpr)
			handlerSpec, err := resolver.discoverHandlerSpec(ctx, fn, handlerExpr)
			if err != nil {
				panic(fmt.Errorf("discover handler spec for %s %s: %w", method, routeConst, err))
			}
			requestType, pathParamsType, responseType, err := resolveEndpointTypes(
				registry,
				routeConst,
				method,
				routePath,
				handlerName,
				handlerSpec,
			)
			if err != nil {
				panic(fmt.Errorf("resolve endpoint types for %s %s: %w", method, routeConst, err))
			}

			discovered = append(discovered, discoveredRouteEndpoint{
				Method:        method,
				RouteConst:    routeConst,
				HandlerName:   handlerName,
				RequestType:   requestType,
				PathParams:    pathParamsType,
				ResponseType:  responseType,
				Binary:        handlerSpec.Binary,
				EnclosingFunc: fn,
				HandlerExpr:   handlerExpr,
				File:          file,
			})
			return true
		})
	}

	specs := make([]EndpointSpec, 0, len(discovered))
	seen := make(map[string]struct{}, len(discovered))
	routeNames := make([]string, len(discovered))
	routeFunctionBindings := make(map[string]map[string]struct{}, len(discovered))
	handlerBaseBindings := make(map[string]map[string]struct{}, len(discovered))
	for index, endpoint := range discovered {
		routePath := routePaths[endpoint.RouteConst]
		routeName, err := discoveredEndpointRouteName(endpoint.RouteConst, routePath, endpoint.HandlerName, endpoint.Method)
		if err != nil {
			return nil, err
		}
		routeNames[index] = routeName
		bindingKey := endpoint.Method + "\x00" + routeName
		defaultName := routeFunctionName(routeName)
		bindings := routeFunctionBindings[defaultName]
		if bindings == nil {
			bindings = map[string]struct{}{}
			routeFunctionBindings[defaultName] = bindings
		}
		bindings[bindingKey] = struct{}{}
		if handlerBase := endpointHandlerBaseName(endpoint.HandlerName); handlerBase != "" {
			bindings := handlerBaseBindings[handlerBase]
			if bindings == nil {
				bindings = map[string]struct{}{}
				handlerBaseBindings[handlerBase] = bindings
			}
			bindings[bindingKey] = struct{}{}
		}
	}
	routeFunctionNameCounts := make(map[string]int, len(routeFunctionBindings))
	for name, bindings := range routeFunctionBindings {
		routeFunctionNameCounts[name] = len(bindings)
	}
	handlerBaseCounts := make(map[string]int, len(handlerBaseBindings))
	for handlerBase, bindings := range handlerBaseBindings {
		handlerBaseCounts[handlerBase] = len(bindings)
	}

	for index, endpoint := range discovered {
		routeName := routeNames[index]
		functionName := discoveredEndpointFunctionName(
			endpoint.Method,
			routeName,
			endpoint.HandlerName,
			routeFunctionNameCounts,
			handlerBaseCounts,
		)

		spec := EndpointSpec{
			FunctionName:    functionName,
			Method:          endpoint.Method,
			RouteCollection: "GoHTTPRoutes",
			RouteName:       routeName,
			RequestType:     endpoint.RequestType,
			PathParamsType:  endpoint.PathParams,
			ResponseType:    endpoint.ResponseType,
			BinaryResponse:  endpoint.Binary,
		}
		key := spec.Method + "\x00" + spec.RouteCollection + "\x00" + spec.RouteName + "\x00" + spec.FunctionName
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		specs = append(specs, spec)
	}

	slices.SortFunc(specs, func(left EndpointSpec, right EndpointSpec) int {
		if left.FunctionName == right.FunctionName {
			if left.Method == right.Method {
				return strings.Compare(left.RouteName, right.RouteName)
			}
			return strings.Compare(left.Method, right.Method)
		}
		return strings.Compare(left.FunctionName, right.FunctionName)
	})
	return specs, nil
}

func httpRouteConstPaths() map[string]string {
	output := make(map[string]string, len(httpapi.DiscoveredRouteConstants()))
	for _, route := range httpapi.DiscoveredRouteConstants() {
		output[route.Name] = route.Path
	}
	return output
}

func includeHTTPRouteConstant(name string, path string) bool {
	if name == "RouteAPIPrefix" {
		return false
	}
	if name == "RoutePluginsAssetWildcard" {
		return false
	}
	return !strings.HasPrefix(strings.TrimSpace(path), "/__setta__/")
}

func discoveredEndpointRouteName(routeConst string, routePath string, handlerName string, method string) (string, error) {
	candidates := namedRoutesForConstant(routeConst, routePath)
	if len(candidates) == 0 {
		return "", fmt.Errorf("route %s has no frontend route name", routeConst)
	}
	if len(candidates) == 1 {
		return candidates[0].Name, nil
	}

	handlerBase := strings.TrimSuffix(strings.TrimSpace(handlerName), "Handler")
	for _, candidate := range candidates {
		if candidate.Name == handlerBase {
			return candidate.Name, nil
		}
	}
	for _, prefix := range []string{strings.ToLower(method), "get", "set"} {
		for _, candidate := range candidates {
			if strings.HasPrefix(strings.ToLower(candidate.Name), prefix) {
				return candidate.Name, nil
			}
		}
	}

	names := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		names = append(names, candidate.Name)
	}
	return "", fmt.Errorf("route %s has ambiguous frontend route names: %s", routeConst, strings.Join(names, ", "))
}

func discoveredEndpointFunctionName(
	method string,
	routeName string,
	handlerName string,
	routeFunctionNameCounts map[string]int,
	handlerBaseCounts map[string]int,
) string {
	defaultName := routeFunctionName(routeName)
	if routeFunctionNameCounts[defaultName] <= 1 {
		return defaultName
	}

	handlerBase := endpointHandlerBaseName(handlerName)
	if handlerBase == "" {
		return disambiguatedRouteFunctionName(method, routeName, "")
	}
	if handlerBaseCounts[handlerBase] <= 1 {
		return routeFunctionName(handlerBase)
	}
	return disambiguatedRouteFunctionName(method, routeName, handlerBase)
}

func routeFunctionName(value string) string {
	return "route_" + snakeCaseFrontendIdentifier(value)
}

func endpointHandlerBaseName(handlerName string) string {
	return strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(handlerName), "Handler"))
}

func disambiguatedRouteFunctionName(method string, routeName string, handlerBase string) string {
	prefix := endpointHandlerActionPrefix(handlerBase)
	if prefix == "" {
		prefix = strings.ToLower(strings.TrimSpace(method))
	}
	routeSnake := snakeCaseFrontendIdentifier(routeName)
	if strings.HasPrefix(routeSnake, prefix+"_") {
		prefix = strings.ToLower(strings.TrimSpace(method))
		if strings.HasPrefix(routeSnake, prefix+"_") {
			return routeFunctionName(routeName)
		}
	}
	return "route_" + prefix + "_" + routeSnake
}

func endpointHandlerActionPrefix(handlerBase string) string {
	trimmed := strings.TrimSpace(handlerBase)
	if trimmed == "" {
		return ""
	}
	words := splitFrontendBindingIdentifierWords(strings.ToUpper(trimmed[:1]) + trimmed[1:])
	if len(words) == 0 {
		return ""
	}
	return strings.ToLower(words[0])
}

func snakeCaseFrontendIdentifier(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	words := splitFrontendBindingIdentifierWords(strings.ToUpper(trimmed[:1]) + trimmed[1:])
	for index, word := range words {
		words[index] = strings.ToLower(word)
	}
	return strings.Join(words, "_")
}

func resolveEndpointTypes(
	registry namedTypeRegistry,
	routeConst string,
	method string,
	routePath string,
	handlerName string,
	handlerSpec discoveredHandlerSpec,
) (reflect.Type, reflect.Type, reflect.Type, error) {
	routeName, err := discoveredEndpointRouteName(routeConst, routePath, handlerName, method)
	if err != nil {
		return nil, nil, nil, err
	}
	semanticBase := strings.ToUpper(routeName[:1]) + routeName[1:]
	handlerBase := strings.TrimSuffix(strings.TrimSpace(handlerName), "Handler")
	if handlerBase != "" {
		handlerBase = strings.ToUpper(handlerBase[:1]) + handlerBase[1:]
	}
	overrideKey := method + " " + routeConst

	requestType := endpointRequestTypeOverrides[overrideKey]
	if requestType == nil {
		requestType, err = resolveDiscoveredEndpointRequestType(registry, semanticBase, handlerBase, handlerSpec.RequestType)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("request type: %w", err)
		}
	}
	if override, ok := endpointRequestTypeOverrides[overrideKey]; ok {
		requestType = override
	}
	pathParamsType, err := resolveDiscoveredEndpointPathParamsType(registry, semanticBase, routePath, method, requestType)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("path params type: %w", err)
	}
	responseType := endpointResponseTypeOverrides[overrideKey]
	if responseType == nil {
		responseType, err = resolveDiscoveredEndpointResponseType(registry, semanticBase, handlerBase, handlerSpec.ResponseType, handlerSpec.Binary)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("response type: %w", err)
		}
	}
	if override, ok := endpointResponseTypeOverrides[overrideKey]; ok {
		responseType = override
	}
	return requestType, pathParamsType, responseType, nil
}

func resolveDiscoveredEndpointRequestType(
	registry namedTypeRegistry,
	semanticBase string,
	handlerBase string,
	discovered sourceTypeRef,
) (reflect.Type, error) {
	if t, ok := registry.fromSource(discovered); ok {
		if frontendTransportOnlyEndpointType(t) {
			return nil, nil
		}
		if t.Kind() == reflect.Struct && t.NumField() == 0 && t.Name() == "" {
			return nil, nil
		}
		if t.Name() == "struct {}" {
			return nil, nil
		}
		return t, nil
	}

	for _, candidate := range endpointRequestCandidateNames(semanticBase, handlerBase) {
		if t, ok := registry.byNameExact(candidate); ok {
			return t, nil
		}
	}
	if discovered.Builtin == "" && discovered.Name == "" {
		return nil, nil
	}
	return nil, fmt.Errorf("unresolved request type for %s", semanticBase)
}

func frontendTransportOnlyEndpointType(t reflect.Type) bool {
	if t == nil {
		return false
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.PkgPath() + "." + t.Name() {
	case "net/http.Request", "net/http.ResponseWriter", "context.Context":
		return true
	default:
		return false
	}
}

func resolveDiscoveredEndpointPathParamsType(
	registry namedTypeRegistry,
	semanticBase string,
	routePath string,
	method string,
	requestType reflect.Type,
) (reflect.Type, error) {
	paramNames := routePathParamNames(routePath)
	if len(paramNames) == 0 {
		return nil, nil
	}
	if method == "GET" && requestType != nil {
		return nil, nil
	}

	for _, candidate := range []string{
		semanticBase + "RouteParams",
		semanticBase + "PathParams",
		routeParamTypeName(paramNames),
	} {
		if candidate == "" {
			continue
		}
		if t, ok := registry.byNameExact(candidate); ok {
			return t, nil
		}
	}

	fields := make([]reflect.StructField, 0, len(paramNames))
	for _, name := range paramNames {
		fields = append(fields, reflect.StructField{
			Name: exportRouteParamFieldName(name),
			Type: reflect.TypeOf(""),
			Tag:  reflect.StructTag(`json:"` + name + `"`),
		})
	}
	return reflect.StructOf(fields), nil
}

func resolveDiscoveredEndpointResponseType(
	registry namedTypeRegistry,
	semanticBase string,
	handlerBase string,
	discovered sourceTypeRef,
	binary bool,
) (reflect.Type, error) {
	if binary {
		if t, ok := registry.byNameExact(semanticBase + "Response"); ok {
			return t, nil
		}
		if t, ok := registry.byNameExact("BinaryDownloadResponse"); ok {
			return t, nil
		}
	}
	if discovered.Container == "slice" && discovered.Elem != nil {
		if listType, ok := registry.listTypeForElement(*discovered.Elem); ok {
			return listType, nil
		}
	}
	if t, ok := registry.fromSource(discovered); ok {
		return t, nil
	}
	if discovered.Builtin == "" && discovered.Name == "" {
		return nil, nil
	}

	for _, candidate := range endpointResponseCandidateNames(semanticBase, handlerBase) {
		if t, ok := registry.byNameExact(candidate); ok {
			return t, nil
		}
	}
	return nil, fmt.Errorf("unresolved response type for %s", semanticBase)
}

func (r namedTypeRegistry) listTypeForElement(ref sourceTypeRef) (reflect.Type, bool) {
	element, ok := r.fromSource(ref)
	if !ok {
		return nil, false
	}
	elementName := frontendBindingTypeName(element)
	for _, candidate := range []string{
		elementName + "List",
		elementName + "ListResponse",
		singularFrontendName(elementName) + "List",
		singularFrontendName(elementName) + "ListResponse",
	} {
		if t, ok := r.byNameExact(candidate); ok {
			return t, true
		}
	}
	return nil, false
}

func endpointRequestCandidateNames(semanticBase string, handlerBase string) []string {
	semanticSubject := requestSubjectName(semanticBase)
	handlerSubject := requestSubjectName(handlerBase)
	return uniqueNonEmptyStrings(
		endpointCandidateName(semanticBase, "RequestInput"),
		endpointCandidateName(semanticBase, "Request"),
		endpointCandidateName(semanticSubject, "RequestInput"),
		endpointCandidateName(semanticSubject, "Request"),
		endpointCandidateName(handlerBase, "RequestInput"),
		endpointCandidateName(handlerBase, "Request"),
		endpointCandidateName(handlerSubject, "RequestInput"),
		endpointCandidateName(handlerSubject, "Request"),
	)
}

func endpointResponseCandidateNames(semanticBase string, handlerBase string) []string {
	semanticSubject := requestSubjectName(semanticBase)
	handlerSubject := requestSubjectName(handlerBase)
	return uniqueNonEmptyStrings(
		endpointCandidateName(semanticBase, "Response"),
		endpointCandidateName(semanticBase, "Snapshot"),
		endpointCandidateName(semanticSubject, "Response"),
		endpointCandidateName(semanticSubject, "Snapshot"),
		endpointCandidateName(semanticSubject, "State"),
		semanticSubject,
		endpointCandidateName(singularFrontendName(semanticSubject), "List"),
		endpointCandidateName(singularFrontendName(semanticSubject), "ListResponse"),
		endpointCandidateName(semanticSubject, "List"),
		endpointCandidateName(semanticSubject, "ListResponse"),
		endpointCandidateName(handlerBase, "Response"),
		endpointCandidateName(handlerBase, "Snapshot"),
		endpointCandidateName(handlerSubject, "Response"),
		endpointCandidateName(handlerSubject, "Snapshot"),
		endpointCandidateName(handlerSubject, "State"),
		handlerSubject,
		endpointCandidateName(singularFrontendName(handlerSubject), "List"),
		endpointCandidateName(singularFrontendName(handlerSubject), "ListResponse"),
		endpointCandidateName(handlerSubject, "List"),
		endpointCandidateName(handlerSubject, "ListResponse"),
	)
}

func endpointCandidateName(base string, suffix string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		return ""
	}
	return base + suffix
}

func requestSubjectName(value string) string {
	for _, prefix := range []string{
		"Get", "List", "Load", "Create", "Update", "Delete",
		"Set", "Start", "Stop", "Cancel", "Publish", "Add",
		"Remove", "Pin", "Write", "Read", "Check", "Import",
		"Transfer", "Append", "Prepare", "Paste", "Reconnect",
		"Respond", "Reveal", "Restart", "Repair", "Run", "Undo", "Redo",
		"Toggle",
	} {
		if strings.HasPrefix(value, prefix) && len(value) > len(prefix) {
			return value[len(prefix):]
		}
	}
	return value
}

func singularFrontendName(value string) string {
	if strings.HasSuffix(value, "ies") && len(value) > 3 {
		return value[:len(value)-3] + "y"
	}
	if strings.HasSuffix(value, "s") && !strings.HasSuffix(value, "ss") && len(value) > 1 {
		return value[:len(value)-1]
	}
	return value
}

func uniqueNonEmptyStrings(values ...string) []string {
	output := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		output = append(output, trimmed)
	}
	return output
}

func routeParamTypeName(paramNames []string) string {
	if len(paramNames) == 0 {
		return ""
	}
	parts := make([]string, 0, len(paramNames))
	for _, name := range paramNames {
		switch strings.TrimSpace(name) {
		case "deploymentName":
			parts = append(parts, "Deployment")
		case "version":
			parts = append(parts, "Version")
		default:
			parts = append(parts, exportRouteParamFieldName(name))
		}
	}
	return strings.Join(parts, "") + "RouteParams"
}

func exportRouteParamFieldName(name string) string {
	words := splitFrontendBindingIdentifierWords(strings.ToUpper(name[:1]) + name[1:])
	for index, word := range words {
		words[index] = strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
	}
	return strings.Join(words, "")
}

func newNamedTypeRegistry() namedTypeRegistry {
	qualified := map[string]reflect.Type{}
	byName := map[string][]reflect.Type{}
	visited := map[reflect.Type]struct{}{}

	register := func(t reflect.Type) {
		if t == nil {
			return
		}
		if t.Kind() == reflect.Pointer {
			t = t.Elem()
		}
		if t.Name() == "" {
			return
		}
		key := t.PkgPath() + "." + t.Name()
		if _, ok := qualified[key]; ok {
			return
		}
		qualified[key] = t
		byName[t.Name()] = append(byName[t.Name()], t)
	}
	var registerRecursive func(t reflect.Type)
	registerRecursive = func(t reflect.Type) {
		if t == nil {
			return
		}
		for t.Kind() == reflect.Pointer {
			t = t.Elem()
		}
		if _, ok := visited[t]; ok {
			return
		}
		visited[t] = struct{}{}

		register(t)

		switch t.Kind() {
		case reflect.Slice, reflect.Array:
			registerRecursive(t.Elem())
		case reflect.Map:
			registerRecursive(t.Key())
			registerRecursive(t.Elem())
		case reflect.Struct:
			for fieldIndex := range t.NumField() {
				registerRecursive(t.Field(fieldIndex).Type)
			}
		case reflect.Interface:
			for methodIndex := range t.NumMethod() {
				registerRecursive(t.Method(methodIndex).Type)
			}
		case reflect.Func:
			for inputIndex := range t.NumIn() {
				registerRecursive(t.In(inputIndex))
			}
			for outputIndex := range t.NumOut() {
				registerRecursive(t.Out(outputIndex))
			}
		}
	}

	for _, t := range DiscoveredConvertibleTypes() {
		registerRecursive(t)
	}
	for _, t := range DiscoveredEndpointContractTypes() {
		registerRecursive(t)
	}
	for sourceType, targetType := range discoveredTypeOverrides {
		registerRecursive(sourceType)
		registerRecursive(targetType)
	}

	return namedTypeRegistry{
		byQualified: qualified,
		byName:      byName,
	}
}

func (r namedTypeRegistry) byNameExact(name string) (reflect.Type, bool) {
	candidates, ok := r.byName[strings.TrimSpace(name)]
	if !ok || len(candidates) == 0 {
		return nil, false
	}
	for _, candidate := range candidates {
		if candidate.PkgPath() == sourcePackageFrontendBindings {
			return candidate, true
		}
	}
	return candidates[0], true
}

func (r namedTypeRegistry) fromSource(ref sourceTypeRef) (reflect.Type, bool) {
	if ref.Container != "" {
		switch ref.Container {
		case "slice":
			if ref.Elem == nil {
				return nil, false
			}
			elem, ok := r.fromSource(*ref.Elem)
			if !ok {
				return nil, false
			}
			return reflect.SliceOf(elem), true
		default:
			return nil, false
		}
	}
	if ref.Builtin != "" {
		t, ok := builtinReflectType(ref.Builtin)
		if !ok {
			return nil, false
		}
		return t, true
	}
	if isErrorTypeRef(ref) {
		return reflect.TypeOf((*error)(nil)).Elem(), true
	}
	if ref.Name == "" || ref.PkgPath == "" {
		return nil, false
	}
	t, ok := r.byQualified[ref.PkgPath+"."+ref.Name]
	if !ok {
		return nil, false
	}
	return canonicalFrontendBindingType(t), true
}

func newSourceResolver() (*sourceResolver, error) {
	root, err := frontendBindingsRepoRoot()
	if err != nil {
		return nil, err
	}
	return &sourceResolver{
		repoRoot: root,
		packages: map[string]*sourcePackageIndex{},
	}, nil
}

func frontendBindingsRepoRoot() (string, error) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve current file path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..")), nil
}

func (r *sourceResolver) fileForDecl(pkg *sourcePackageIndex, decl *ast.FuncDecl) *ast.File {
	for _, file := range pkg.files {
		for _, fileDecl := range file.Decls {
			if fileDecl == decl {
				return file
			}
		}
	}
	return nil
}

func (r *sourceResolver) fileContext(pkg *sourcePackageIndex, file *ast.File) sourceFileContext {
	return sourceFileContext{
		pkg:     pkg,
		file:    file,
		imports: fileImportMap(file),
	}
}

func (r *sourceResolver) loadPackage(importPath string) (*sourcePackageIndex, error) {
	if pkg, ok := r.packages[importPath]; ok {
		return pkg, nil
	}
	if !strings.HasPrefix(importPath, "setta/") {
		return nil, fmt.Errorf("unsupported import path %q", importPath)
	}
	dir := filepath.Join(r.repoRoot, strings.TrimPrefix(importPath, "setta/"))
	fset := token.NewFileSet()
	parsed, err := parser.ParseDir(fset, dir, func(info os.FileInfo) bool {
		name := info.Name()
		return strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go")
	}, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parse package %s: %w", importPath, err)
	}

	var astPkg *ast.Package
	for _, pkg := range parsed {
		astPkg = pkg
		break
	}
	if astPkg == nil {
		return nil, fmt.Errorf("package %s has no source files", importPath)
	}

	index := &sourcePackageIndex{
		importPath: importPath,
		dir:        dir,
		fset:       fset,
		files:      make([]*ast.File, 0, len(astPkg.Files)),
		funcs:      map[string]*ast.FuncDecl{},
		methods:    map[string]map[string]*ast.FuncDecl{},
		types:      map[string]*ast.TypeSpec{},
	}
	for _, file := range astPkg.Files {
		index.files = append(index.files, file)
		for _, decl := range file.Decls {
			switch typed := decl.(type) {
			case *ast.FuncDecl:
				if typed.Recv == nil {
					index.funcs[typed.Name.Name] = typed
					continue
				}
				receiver := receiverBaseName(typed.Recv.List[0].Type)
				if receiver == "" {
					continue
				}
				methods := index.methods[receiver]
				if methods == nil {
					methods = map[string]*ast.FuncDecl{}
					index.methods[receiver] = methods
				}
				methods[typed.Name.Name] = typed
			case *ast.GenDecl:
				if typed.Tok != token.TYPE {
					continue
				}
				for _, spec := range typed.Specs {
					typeSpec, ok := spec.(*ast.TypeSpec)
					if !ok {
						continue
					}
					index.types[typeSpec.Name.Name] = typeSpec
				}
			}
		}
	}
	r.packages[importPath] = index
	return index, nil
}

func routeRegistrationCall(call *ast.CallExpr) (string, string, ast.Expr, bool) {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return "", "", nil, false
	}
	method := strings.TrimSpace(selector.Sel.Name)
	if method != "Get" && method != "Post" {
		return "", "", nil, false
	}
	if len(call.Args) < 2 {
		return "", "", nil, false
	}
	routeIdent, ok := call.Args[0].(*ast.Ident)
	if !ok || !strings.HasPrefix(routeIdent.Name, "Route") {
		return "", "", nil, false
	}
	return strings.ToUpper(method), routeIdent.Name, call.Args[1], true
}

func handlerNameFromExpr(expr ast.Expr) string {
	switch typed := expr.(type) {
	case *ast.CallExpr:
		return handlerNameFromExpr(typed.Fun)
	case *ast.Ident:
		return typed.Name
	case *ast.SelectorExpr:
		return typed.Sel.Name
	default:
		return ""
	}
}

func receiverBaseName(expr ast.Expr) string {
	switch typed := expr.(type) {
	case *ast.Ident:
		return typed.Name
	case *ast.StarExpr:
		return receiverBaseName(typed.X)
	default:
		return ""
	}
}

func fileImportMap(file *ast.File) map[string]string {
	imports := make(map[string]string, len(file.Imports))
	for _, spec := range file.Imports {
		path := strings.Trim(spec.Path.Value, `"`)
		name := ""
		if spec.Name != nil {
			name = spec.Name.Name
		}
		if name == "" {
			segments := strings.Split(path, "/")
			name = segments[len(segments)-1]
		}
		imports[name] = path
	}
	return imports
}

func (r *sourceResolver) discoverHandlerSpec(
	ctx sourceFileContext,
	enclosing *ast.FuncDecl,
	handlerExpr ast.Expr,
) (discoveredHandlerSpec, error) {
	switch typed := handlerExpr.(type) {
	case *ast.FuncLit:
		env := r.funcParamEnv(ctx, enclosing)
		return r.analyzeFuncBody(ctx, typed.Body, env)
	case *ast.CallExpr:
		if spec, ok := r.discoverWrappedHandlerSpec(ctx, enclosing, typed); ok {
			return spec, nil
		}
		return r.discoverHandlerSpec(ctx, enclosing, typed.Fun)
	case *ast.Ident:
		decl := ctx.pkg.funcs[typed.Name]
		if decl == nil {
			return discoveredHandlerSpec{}, fmt.Errorf("handler function %s not found", typed.Name)
		}
		body := returnedFuncBody(decl)
		if body == nil {
			return discoveredHandlerSpec{}, fmt.Errorf("handler function %s does not return a func literal", typed.Name)
		}
		env := r.funcParamEnv(ctx, decl)
		return r.analyzeFuncBody(ctx, body, env)
	default:
		return discoveredHandlerSpec{}, fmt.Errorf("unsupported handler expression %T", handlerExpr)
	}
}

func (r *sourceResolver) discoverWrappedHandlerSpec(
	ctx sourceFileContext,
	enclosing *ast.FuncDecl,
	call *ast.CallExpr,
) (discoveredHandlerSpec, bool) {
	if call == nil {
		return discoveredHandlerSpec{}, false
	}
	for index := len(call.Args) - 1; index >= 0; index-- {
		spec, err := r.discoverHandlerSpec(ctx, enclosing, call.Args[index])
		if err == nil {
			return spec, true
		}
	}
	return discoveredHandlerSpec{}, false
}

func returnedFuncBody(fn *ast.FuncDecl) *ast.BlockStmt {
	if fn.Body == nil {
		return nil
	}
	for _, stmt := range fn.Body.List {
		returnStmt, ok := stmt.(*ast.ReturnStmt)
		if !ok || len(returnStmt.Results) != 1 {
			continue
		}
		funcLit, ok := returnStmt.Results[0].(*ast.FuncLit)
		if !ok {
			continue
		}
		return funcLit.Body
	}
	return nil
}

func (r *sourceResolver) funcParamEnv(ctx sourceFileContext, fn *ast.FuncDecl) sourceValueEnv {
	env := sourceValueEnv{}
	if fn == nil || fn.Type == nil || fn.Type.Params == nil {
		return env
	}
	for _, field := range fn.Type.Params.List {
		ref, ok := r.resolveTypeExpr(ctx, field.Type)
		if !ok {
			continue
		}
		for _, name := range field.Names {
			env[name.Name] = ref
		}
	}
	return env
}

func (r *sourceResolver) analyzeFuncBody(
	ctx sourceFileContext,
	body *ast.BlockStmt,
	env sourceValueEnv,
) (discoveredHandlerSpec, error) {
	if body == nil {
		return discoveredHandlerSpec{}, nil
	}
	spec := discoveredHandlerSpec{}
	for _, stmt := range body.List {
		if request, ok := r.requestTypeFromStmt(ctx, stmt, env); ok && spec.RequestType == (sourceTypeRef{}) {
			spec.RequestType = request
		}
		if response, ok := r.successResponseTypeFromStmt(ctx, stmt, env); ok && spec.ResponseType == (sourceTypeRef{}) {
			spec.ResponseType = response
		}
		r.updateEnvFromStmt(ctx, stmt, env)
		if !spec.Binary && stmtContainsBinaryResponse(stmt) {
			spec.Binary = true
		}
	}
	return spec, nil
}

func stmtContainsBinaryResponse(stmt ast.Stmt) bool {
	found := false
	ast.Inspect(stmt, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		x, ok := selector.X.(*ast.Ident)
		if !ok {
			return true
		}
		if x.Name == "http" && selector.Sel.Name == "ServeFile" {
			found = true
			return false
		}
		return true
	})
	return found
}

func (r *sourceResolver) requestTypeFromStmt(
	ctx sourceFileContext,
	stmt ast.Stmt,
	env sourceValueEnv,
) (sourceTypeRef, bool) {
	assign, ok := stmt.(*ast.AssignStmt)
	if !ok {
		return sourceTypeRef{}, false
	}
	for _, rhs := range assign.Rhs {
		ref, ok := r.decodeRequestTypeFromExpr(ctx, rhs, env)
		if ok {
			return ref, true
		}
	}
	return sourceTypeRef{}, false
}

func (r *sourceResolver) decodeRequestTypeFromExpr(
	ctx sourceFileContext,
	expr ast.Expr,
	env sourceValueEnv,
) (sourceTypeRef, bool) {
	call, ok := expr.(*ast.CallExpr)
	if !ok {
		return sourceTypeRef{}, false
	}
	switch fun := call.Fun.(type) {
	case *ast.IndexExpr:
		ident, ok := fun.X.(*ast.Ident)
		if !ok {
			return sourceTypeRef{}, false
		}
		if !strings.HasPrefix(ident.Name, "decode") {
			return sourceTypeRef{}, false
		}
		return r.resolveTypeExpr(ctx, fun.Index)
	case *ast.IndexListExpr:
		ident, ok := fun.X.(*ast.Ident)
		if !ok || len(fun.Indices) != 1 {
			return sourceTypeRef{}, false
		}
		if !strings.HasPrefix(ident.Name, "decode") {
			return sourceTypeRef{}, false
		}
		return r.resolveTypeExpr(ctx, fun.Indices[0])
	case *ast.Ident:
		if !strings.HasPrefix(fun.Name, "decode") {
			return sourceTypeRef{}, false
		}
		ref, ok := r.resolveCallExprType(ctx, call, env)
		return ref, ok
	default:
		return sourceTypeRef{}, false
	}
}

func (r *sourceResolver) updateEnvFromStmt(
	ctx sourceFileContext,
	stmt ast.Stmt,
	env sourceValueEnv,
) {
	assign, ok := stmt.(*ast.AssignStmt)
	if ok {
		rhsTypes := r.resolveAssignmentRhsTypes(ctx, assign, env)
		for index, lhs := range assign.Lhs {
			ident, ok := lhs.(*ast.Ident)
			if !ok || ident.Name == "_" || index >= len(rhsTypes) {
				continue
			}
			if ref := rhsTypes[index]; ref != (sourceTypeRef{}) {
				env[ident.Name] = ref
			}
		}
		return
	}

	decl, ok := stmt.(*ast.DeclStmt)
	if !ok {
		return
	}
	gen, ok := decl.Decl.(*ast.GenDecl)
	if !ok || gen.Tok != token.VAR {
		return
	}
	for _, spec := range gen.Specs {
		valueSpec, ok := spec.(*ast.ValueSpec)
		if !ok {
			continue
		}
		var declaredType sourceTypeRef
		if valueSpec.Type != nil {
			declaredType, _ = r.resolveTypeExpr(ctx, valueSpec.Type)
		}
		for index, name := range valueSpec.Names {
			if name.Name == "_" {
				continue
			}
			if index < len(valueSpec.Values) {
				if ref, ok := r.resolveValueExprType(ctx, valueSpec.Values[index], env); ok {
					env[name.Name] = ref
					continue
				}
			}
			if declaredType != (sourceTypeRef{}) {
				env[name.Name] = declaredType
			}
		}
	}
}

func (r *sourceResolver) resolveAssignmentRhsTypes(
	ctx sourceFileContext,
	assign *ast.AssignStmt,
	env sourceValueEnv,
) []sourceTypeRef {
	if assign == nil {
		return nil
	}
	if len(assign.Rhs) == 1 {
		if call, ok := assign.Rhs[0].(*ast.CallExpr); ok {
			if refs, ok := r.resolveCallExprReturnTypes(ctx, call, env); ok {
				return refs
			}
		}
	}

	refs := make([]sourceTypeRef, len(assign.Rhs))
	for index, rhs := range assign.Rhs {
		if ref, ok := r.resolveValueExprType(ctx, rhs, env); ok {
			refs[index] = ref
		}
	}
	return refs
}

func (r *sourceResolver) successResponseTypeFromStmt(
	ctx sourceFileContext,
	stmt ast.Stmt,
	env sourceValueEnv,
) (sourceTypeRef, bool) {
	switch typed := stmt.(type) {
	case *ast.BlockStmt:
		return r.successResponseTypeFromBlock(ctx, typed, cloneSourceValueEnv(env))
	case *ast.IfStmt:
		var fallback sourceTypeRef
		var hasFallback bool

		bodyEnv := cloneSourceValueEnv(env)
		if typed.Init != nil {
			r.updateEnvFromStmt(ctx, typed.Init, bodyEnv)
		}
		if response, ok := r.successResponseTypeFromBlock(ctx, typed.Body, bodyEnv); ok {
			if !isNilSourceTypeRef(response) {
				return response, true
			}
			fallback = response
			hasFallback = true
		}

		if typed.Else != nil {
			elseEnv := cloneSourceValueEnv(env)
			if typed.Init != nil {
				r.updateEnvFromStmt(ctx, typed.Init, elseEnv)
			}
			if response, ok := r.successResponseTypeFromStmt(ctx, typed.Else, elseEnv); ok {
				if !isNilSourceTypeRef(response) {
					return response, true
				}
				fallback = response
				hasFallback = true
			}
		}

		return fallback, hasFallback
	case *ast.ExprStmt:
		call, ok := typed.X.(*ast.CallExpr)
		if !ok {
			return sourceTypeRef{}, false
		}
		selector, ok := call.Fun.(*ast.Ident)
		if !ok || selector.Name != "writeJSON" {
			return sourceTypeRef{}, false
		}
		if len(call.Args) < 3 {
			return sourceTypeRef{}, false
		}
		if !isSuccessHTTPStatus(call.Args[1]) {
			return sourceTypeRef{}, false
		}
		if ident, ok := call.Args[2].(*ast.Ident); ok && ident.Name == "nil" {
			return sourceTypeRef{}, true
		}
		ref, ok := r.resolveValueExprType(ctx, call.Args[2], env)
		return ref, ok
	default:
		return sourceTypeRef{}, false
	}
}

func (r *sourceResolver) successResponseTypeFromBlock(
	ctx sourceFileContext,
	body *ast.BlockStmt,
	env sourceValueEnv,
) (sourceTypeRef, bool) {
	if body == nil {
		return sourceTypeRef{}, false
	}

	var fallback sourceTypeRef
	var hasFallback bool
	for _, stmt := range body.List {
		if response, ok := r.successResponseTypeFromStmt(ctx, stmt, env); ok {
			if !isNilSourceTypeRef(response) {
				return response, true
			}
			fallback = response
			hasFallback = true
		}
		r.updateEnvFromStmt(ctx, stmt, env)
	}
	return fallback, hasFallback
}

func isSuccessHTTPStatus(expr ast.Expr) bool {
	selector, ok := expr.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	x, ok := selector.X.(*ast.Ident)
	if !ok || x.Name != "http" {
		return false
	}
	switch selector.Sel.Name {
	case "StatusOK", "StatusCreated", "StatusAccepted", "StatusNoContent":
		return true
	default:
		return false
	}
}

func (r *sourceResolver) resolveValueExprType(
	ctx sourceFileContext,
	expr ast.Expr,
	env sourceValueEnv,
) (sourceTypeRef, bool) {
	switch typed := expr.(type) {
	case *ast.Ident:
		if typed.Name == "nil" {
			return sourceTypeRef{}, true
		}
		ref, ok := env[typed.Name]
		return ref, ok
	case *ast.BasicLit:
		switch typed.Kind {
		case token.STRING:
			return sourceTypeRef{Builtin: "string"}, true
		case token.INT, token.FLOAT:
			return sourceTypeRef{Builtin: "number"}, true
		default:
			return sourceTypeRef{}, false
		}
	case *ast.CompositeLit:
		return r.resolveTypeExpr(ctx, typed.Type)
	case *ast.CallExpr:
		return r.resolveCallExprType(ctx, typed, env)
	case *ast.SelectorExpr:
		receiver, ok := r.resolveValueExprType(ctx, typed.X, env)
		if !ok {
			return sourceTypeRef{}, false
		}
		return r.resolveFieldType(receiver, typed.Sel.Name)
	case *ast.UnaryExpr:
		if typed.Op != token.AND {
			return sourceTypeRef{}, false
		}
		ref, ok := r.resolveValueExprType(ctx, typed.X, env)
		if !ok {
			return sourceTypeRef{}, false
		}
		ref.Pointer = true
		return ref, true
	default:
		return sourceTypeRef{}, false
	}
}

func (r *sourceResolver) resolveCallExprType(
	ctx sourceFileContext,
	call *ast.CallExpr,
	env sourceValueEnv,
) (sourceTypeRef, bool) {
	refs, ok := r.resolveCallExprReturnTypes(ctx, call, env)
	if !ok {
		return sourceTypeRef{}, false
	}
	for _, ref := range refs {
		if isErrorTypeRef(ref) {
			continue
		}
		return ref, true
	}
	return sourceTypeRef{}, false
}

func (r *sourceResolver) resolveCallExprReturnTypes(
	ctx sourceFileContext,
	call *ast.CallExpr,
	env sourceValueEnv,
) ([]sourceTypeRef, bool) {
	switch fun := call.Fun.(type) {
	case *ast.Ident:
		if fun.Name == "make" && len(call.Args) > 0 {
			ref, ok := r.resolveTypeExpr(ctx, call.Args[0])
			if !ok {
				return nil, false
			}
			return []sourceTypeRef{ref}, true
		}
		if isBuiltinTypeName(fun.Name) || ctx.pkg.types[fun.Name] != nil {
			ref, ok := r.resolveTypeExpr(ctx, fun)
			if !ok {
				return nil, false
			}
			return []sourceTypeRef{ref}, true
		}
		decl := ctx.pkg.funcs[fun.Name]
		if decl == nil {
			return nil, false
		}
		return r.funcDeclReturnTypes(ctx, decl)
	case *ast.SelectorExpr:
		if importPath, ok := ctx.imports[identName(fun.X)]; ok {
			pkg, err := r.loadPackage(importPath)
			if err != nil {
				return nil, false
			}
			if pkg.types[fun.Sel.Name] != nil {
				return []sourceTypeRef{{
					PkgPath: importPath,
					Name:    fun.Sel.Name,
				}}, true
			}
			decl := pkg.funcs[fun.Sel.Name]
			if decl == nil {
				return nil, false
			}
			return r.funcDeclReturnTypes(r.fileContext(pkg, r.fileForDecl(pkg, decl)), decl)
		}
		receiver, ok := r.resolveValueExprType(ctx, fun.X, env)
		if !ok {
			return nil, false
		}
		return r.resolveMethodReturnTypes(receiver, fun.Sel.Name)
	default:
		return nil, false
	}
}

func (r *sourceResolver) funcDeclReturnTypes(
	ctx sourceFileContext,
	fn *ast.FuncDecl,
) ([]sourceTypeRef, bool) {
	if fn == nil || fn.Type == nil || fn.Type.Results == nil {
		return nil, false
	}
	refs := []sourceTypeRef{}
	for _, field := range fn.Type.Results.List {
		ref, ok := r.resolveTypeExpr(ctx, field.Type)
		if !ok {
			continue
		}
		count := len(field.Names)
		if count == 0 {
			count = 1
		}
		for i := 0; i < count; i++ {
			refs = append(refs, ref)
		}
	}
	if len(refs) == 0 {
		return nil, false
	}
	return refs, true
}

func (r *sourceResolver) resolveTypeExpr(ctx sourceFileContext, expr ast.Expr) (sourceTypeRef, bool) {
	switch typed := expr.(type) {
	case *ast.Ident:
		if typed.Name == "error" {
			return sourceTypeRef{Name: "error"}, true
		}
		if isBuiltinTypeName(typed.Name) {
			return sourceTypeRef{Builtin: typed.Name}, true
		}
		return sourceTypeRef{
			PkgPath: ctx.pkg.importPath,
			Name:    typed.Name,
		}, true
	case *ast.SelectorExpr:
		alias := identName(typed.X)
		importPath := ctx.imports[alias]
		if importPath == "" {
			return sourceTypeRef{}, false
		}
		return sourceTypeRef{
			PkgPath: importPath,
			Name:    typed.Sel.Name,
		}, true
	case *ast.StarExpr:
		ref, ok := r.resolveTypeExpr(ctx, typed.X)
		if !ok {
			return sourceTypeRef{}, false
		}
		ref.Pointer = true
		return ref, true
	case *ast.ArrayType:
		elem, ok := r.resolveTypeExpr(ctx, typed.Elt)
		if !ok {
			return sourceTypeRef{}, false
		}
		return sourceTypeRef{
			Container: "slice",
			Elem:      &elem,
		}, true
	default:
		return sourceTypeRef{}, false
	}
}

func (r *sourceResolver) resolveMethodReturnTypes(
	receiver sourceTypeRef,
	methodName string,
) ([]sourceTypeRef, bool) {
	pkg, err := r.loadPackage(receiver.PkgPath)
	if err != nil {
		return nil, false
	}
	if methods := pkg.methods[receiver.Name]; methods != nil {
		if decl := methods[methodName]; decl != nil {
			return r.funcDeclReturnTypes(r.fileContext(pkg, r.fileForDecl(pkg, decl)), decl)
		}
	}
	typeSpec := pkg.types[receiver.Name]
	if typeSpec == nil {
		return nil, false
	}
	interfaceType, ok := typeSpec.Type.(*ast.InterfaceType)
	if !ok {
		return nil, false
	}
	for _, field := range interfaceType.Methods.List {
		if len(field.Names) != 1 || field.Names[0].Name != methodName {
			continue
		}
		fnType, ok := field.Type.(*ast.FuncType)
		if !ok || fnType.Results == nil {
			return nil, false
		}
		refs := []sourceTypeRef{}
		for _, result := range fnType.Results.List {
			ref, ok := r.resolveTypeExpr(r.fileContext(pkg, r.fileForTypeSpec(pkg, typeSpec)), result.Type)
			if !ok {
				continue
			}
			count := len(result.Names)
			if count == 0 {
				count = 1
			}
			for i := 0; i < count; i++ {
				refs = append(refs, ref)
			}
		}
		if len(refs) > 0 {
			return refs, true
		}
	}
	return nil, false
}

func (r *sourceResolver) resolveFieldType(receiver sourceTypeRef, fieldName string) (sourceTypeRef, bool) {
	pkg, err := r.loadPackage(receiver.PkgPath)
	if err != nil {
		return sourceTypeRef{}, false
	}
	typeSpec := pkg.types[receiver.Name]
	if typeSpec == nil {
		return sourceTypeRef{}, false
	}
	ctx := r.fileContext(pkg, r.fileForTypeSpec(pkg, typeSpec))
	switch typed := typeSpec.Type.(type) {
	case *ast.StructType:
		for _, field := range typed.Fields.List {
			for _, name := range field.Names {
				if name.Name != fieldName {
					continue
				}
				return r.resolveTypeExpr(ctx, field.Type)
			}
		}
	case *ast.Ident, *ast.SelectorExpr, *ast.StarExpr:
		target, ok := r.resolveTypeExpr(ctx, typed)
		if !ok {
			return sourceTypeRef{}, false
		}
		return r.resolveFieldType(target, fieldName)
	}
	return sourceTypeRef{}, false
}

func (r *sourceResolver) fileForTypeSpec(pkg *sourcePackageIndex, spec *ast.TypeSpec) *ast.File {
	for _, file := range pkg.files {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, declSpec := range gen.Specs {
				if declSpec == spec {
					return file
				}
			}
		}
	}
	return nil
}

func identName(expr ast.Expr) string {
	ident, ok := expr.(*ast.Ident)
	if !ok {
		return ""
	}
	return ident.Name
}

func isBuiltinTypeName(name string) bool {
	switch strings.TrimSpace(name) {
	case "string", "bool", "int", "int64", "int32", "float64", "float32", "byte", "rune", "any":
		return true
	default:
		return false
	}
}

func isErrorTypeRef(ref sourceTypeRef) bool {
	return ref.Name == "error" &&
		ref.PkgPath == "" &&
		ref.Builtin == "" &&
		ref.Container == "" &&
		ref.Elem == nil
}

func isNilSourceTypeRef(ref sourceTypeRef) bool {
	return ref == (sourceTypeRef{})
}

func cloneSourceValueEnv(env sourceValueEnv) sourceValueEnv {
	cloned := make(sourceValueEnv, len(env))
	for name, ref := range env {
		cloned[name] = ref
	}
	return cloned
}

func builtinReflectType(name string) (reflect.Type, bool) {
	switch strings.TrimSpace(name) {
	case "string":
		return reflect.TypeOf(""), true
	case "bool":
		return reflect.TypeOf(false), true
	case "int":
		return reflect.TypeOf(int(0)), true
	case "int64":
		return reflect.TypeOf(int64(0)), true
	case "int32":
		return reflect.TypeOf(int32(0)), true
	case "float64":
		return reflect.TypeOf(float64(0)), true
	case "float32":
		return reflect.TypeOf(float32(0)), true
	case "byte":
		return reflect.TypeOf(byte(0)), true
	case "rune":
		return reflect.TypeOf(rune(0)), true
	case "any":
		return reflect.TypeOf((*interface{})(nil)).Elem(), true
	default:
		return nil, false
	}
}
