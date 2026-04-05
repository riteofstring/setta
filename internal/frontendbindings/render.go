package frontendbindings

import (
	"bytes"
	_ "embed"
	"fmt"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"text/template"
)

//go:embed templates/routes.ts.tmpl
var routesTemplateText string

//go:embed templates/types.ts.tmpl
var typesTemplateText string

//go:embed templates/endpoints.ts.tmpl
var endpointsTemplateText string

// setta-go-type-discovery: skip
type GeneratedBindings struct {
	RoutesTS    string
	TypesTS     string
	EndpointsTS string
}

type endpointPathParamRenderData struct {
	Name     string
	TypeExpr string
}

type endpointRenderData struct {
	FunctionName    string
	FunctionParams  []endpointPathParamRenderData
	ResponseTypeRef string
	CallExpression  string
}

type routeEnumEntry struct {
	EnumName string
	Path     string
}

type routeHelperRenderData struct {
	Name             string
	FunctionParams   []endpointPathParamRenderData
	ReturnExpression string
}

type routeHelperGroupRenderData struct {
	ConstName string
	Helpers   []routeHelperRenderData
}

type endpointImportContract struct {
	SupportedRouteCollections map[string]struct{}
	ReservedValueSymbols      map[string]string
}

type emittedSymbol struct {
	Name   string
	Origin string
}

var tsIdentifierPattern = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)
var routePathParamPattern = regexp.MustCompile(`\{([^}]+)\}`)

var tsReservedBindingKeywords = map[string]struct{}{
	"break": {}, "case": {}, "catch": {}, "class": {}, "const": {}, "continue": {},
	"debugger": {}, "default": {}, "delete": {}, "do": {}, "else": {}, "enum": {},
	"export": {}, "extends": {}, "false": {}, "finally": {}, "for": {}, "function": {},
	"if": {}, "import": {}, "in": {}, "instanceof": {}, "new": {}, "null": {},
	"return": {}, "super": {}, "switch": {}, "this": {}, "throw": {}, "true": {},
	"try": {}, "typeof": {}, "var": {}, "void": {}, "while": {}, "with": {},
	"implements": {}, "interface": {}, "let": {}, "package": {}, "private": {},
	"protected": {}, "public": {}, "static": {}, "yield": {},
}

var generatedEndpointsImportContract = endpointImportContract{
	SupportedRouteCollections: map[string]struct{}{
		"GoHTTPRoutes": {},
	},
	ReservedValueSymbols: map[string]string{
		"get":                "generated endpoints import",
		"getBinary":          "generated endpoints import",
		"post":               "generated endpoints import",
		"GoHTTPRouteHelpers": "generated endpoints import",
		"gt":                 "generated endpoints import",
	},
}

var generatedRoutesReservedValueSymbols = map[string]string{
	"RouteEnum":                       "generated routes export",
	"replaceGeneratedRoutePathParams": "generated routes helper function",
}

func Build() (GeneratedBindings, error) {
	return buildBindings(
		CurrentRouteGroups(),
		CurrentEndpoints(),
		CurrentAdditionalTypeRoots(),
	)
}

func buildBindings(
	routeGroups []RouteGroup,
	endpointSpecs []EndpointSpec,
	extraTypes []reflect.Type,
) (GeneratedBindings, error) {
	if err := validateEndpointSpecs(routeGroups, endpointSpecs); err != nil {
		return GeneratedBindings{}, err
	}
	routeCollections, err := buildRouteCollectionLookup(routeGroups)
	if err != nil {
		return GeneratedBindings{}, err
	}

	converter := newTypeConverter()
	renderEndpoints := make([]endpointRenderData, 0, len(endpointSpecs))
	renderRouteHelpers, err := renderRouteHelperGroups(routeGroups)
	if err != nil {
		return GeneratedBindings{}, err
	}
	for _, extraType := range extraTypes {
		if err := converter.AddRootType(extraType); err != nil {
			return GeneratedBindings{}, err
		}
	}
	for _, spec := range endpointSpecs {
		if err := converter.AddRootType(spec.RequestType); err != nil {
			return GeneratedBindings{}, err
		}
		if err := converter.AddRootType(spec.ResponseType); err != nil {
			return GeneratedBindings{}, err
		}

		functionParams, addressParamNames, err := renderEndpointFunctionParams(spec, converter)
		if err != nil {
			return GeneratedBindings{}, err
		}

		responseTypeRef, err := renderEndpointTypeExpr(converter, spec.ResponseType)
		if err != nil {
			return GeneratedBindings{}, fmt.Errorf("endpoint %s: response type: %w", spec.FunctionName, err)
		}

		renderEndpoints = append(renderEndpoints, endpointRenderData{
			FunctionName:    spec.FunctionName,
			FunctionParams:  functionParams,
			ResponseTypeRef: responseTypeRef,
			CallExpression: renderEndpointCallExpression(
				spec,
				routeCollections[spec.RouteCollection][spec.RouteName],
				addressParamNames,
			),
		})
	}

	extraDeclarations := CurrentAdditionalDeclarations(converter)
	declarations := append(converter.Declarations(), extraDeclarations...)
	if err := validateTypeDeclarations(declarations); err != nil {
		return GeneratedBindings{}, err
	}

	routesTS, err := renderTemplate(routesTemplateText, map[string]any{
		"RouteGroups":       routeGroups,
		"RouteHelperGroups": renderRouteHelpers,
		"RouteEnumEntries":  flattenRouteEnumEntries(routeGroups),
	})
	if err != nil {
		return GeneratedBindings{}, err
	}

	typesTS, err := renderTemplate(typesTemplateText, map[string]any{
		"Declarations": declarations,
	})
	if err != nil {
		return GeneratedBindings{}, err
	}

	endpointsTS, err := renderTemplate(endpointsTemplateText, map[string]any{
		"Endpoints": renderEndpoints,
	})
	if err != nil {
		return GeneratedBindings{}, err
	}

	return GeneratedBindings{
		RoutesTS:    routesTS,
		TypesTS:     typesTS,
		EndpointsTS: endpointsTS,
	}, nil
}

func renderEndpointFunctionParams(
	spec EndpointSpec,
	converter *typeConverter,
) ([]endpointPathParamRenderData, []string, error) {
	params := make([]endpointPathParamRenderData, 0, 4)

	pathParamFields, err := endpointPathParamFields(spec.PathParamsType)
	if err != nil {
		return nil, nil, fmt.Errorf("endpoint %s: %w", spec.FunctionName, err)
	}
	addressParamNames := make([]string, 0, len(pathParamFields))
	for _, field := range pathParamFields {
		typeExpr, err := renderEndpointParamTypeExpr(converter, field.Type)
		if err != nil {
			return nil, nil, fmt.Errorf(
				"endpoint %s: path param %s: %w",
				spec.FunctionName,
				field.Name,
				err,
			)
		}
		params = append(params, endpointPathParamRenderData{
			Name:     field.Name,
			TypeExpr: typeExpr,
		})
		addressParamNames = append(addressParamNames, field.Name)
	}

	if spec.RequestType != nil {
		typeExpr, err := renderEndpointTypeExpr(converter, spec.RequestType)
		if err != nil {
			return nil, nil, fmt.Errorf("endpoint request: %w", err)
		}
		params = append(params, endpointPathParamRenderData{
			Name:     "x",
			TypeExpr: typeExpr,
		})
	}

	return params, addressParamNames, nil
}

func renderEndpointParamTypeExpr(converter *typeConverter, t reflect.Type) (string, error) {
	if frontendTypeName(t) != "" {
		if err := converter.AddRootType(t); err != nil {
			return "", err
		}
		return tsTypeReference(t), nil
	}
	return converter.renderTypeExpr(t)
}

func renderEndpointTypeExpr(converter *typeConverter, t reflect.Type) (string, error) {
	if t == nil {
		return "null", nil
	}
	return converter.renderTypeExprWithQualifier(t, "gt.")
}

func renderEndpointCallExpression(
	spec EndpointSpec,
	routePath string,
	addressParamNames []string,
) string {
	routeParamNames := routePathParamNames(routePath)
	routeArgExprs := slices.Clone(addressParamNames)
	queryParamsExpr := ""
	if len(routeArgExprs) == 0 && len(routeParamNames) > 0 && spec.RequestType != nil {
		routeArgExprs = make([]string, 0, len(routeParamNames))
		for _, routeParamName := range routeParamNames {
			routeArgExprs = append(routeArgExprs, "x."+routeParamName)
		}
		queryParamsExpr = fmt.Sprintf(
			"omitGeneratedRouteParams(x, %s)",
			renderStringLiteralArray(routeParamNames),
		)
	}

	routeRef := renderEndpointRouteCall(spec, routeArgExprs)

	switch {
	case spec.BinaryResponse:
		if queryParamsExpr != "" {
			return fmt.Sprintf("getBinary(%s, %s)", routeRef, queryParamsExpr)
		}
		if spec.RequestType != nil {
			return fmt.Sprintf("getBinary(%s, x)", routeRef)
		}
		return fmt.Sprintf("getBinary(%s)", routeRef)
	case spec.Method == "GET":
		if queryParamsExpr != "" {
			return fmt.Sprintf("get(%s, %s)", routeRef, queryParamsExpr)
		}
		if spec.RequestType != nil {
			return fmt.Sprintf("get(%s, x)", routeRef)
		}
		return fmt.Sprintf("get(%s)", routeRef)
	default:
		bodyExpr := "null"
		if spec.RequestType != nil {
			bodyExpr = "x"
		}
		return fmt.Sprintf("post(%s, %s)", routeRef, bodyExpr)
	}
}

func renderEndpointRouteCall(spec EndpointSpec, routeArgExprs []string) string {
	helperCollection := endpointRouteHelperCollection(spec.RouteCollection)
	if len(routeArgExprs) == 0 {
		return fmt.Sprintf("%s.%s()", helperCollection, spec.RouteName)
	}
	return fmt.Sprintf(
		"%s.%s(%s)",
		helperCollection,
		spec.RouteName,
		strings.Join(routeArgExprs, ", "),
	)
}

func endpointRouteHelperCollection(routeCollection string) string {
	switch routeCollection {
	case "GoHTTPRoutes":
		return "GoHTTPRouteHelpers"
	default:
		return routeCollection
	}
}

func renderAddressParamsExpr(names []string) string {
	if len(names) == 0 {
		return ""
	}
	return "{ " + strings.Join(names, ", ") + " }"
}

func renderStringLiteralArray(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

func renderRouteHelperGroups(routeGroups []RouteGroup) ([]routeHelperGroupRenderData, error) {
	helperGroups := make([]routeHelperGroupRenderData, 0, len(routeGroups))
	for _, group := range routeGroups {
		if strings.TrimSpace(group.HelperConstName) == "" {
			continue
		}

		helpers := make([]routeHelperRenderData, 0, len(group.Routes))
		for _, route := range group.Routes {
			paramNames := routePathParamNames(route.Path)
			if group.HelperOnlyPathParams && len(paramNames) == 0 {
				continue
			}
			functionParams := make([]endpointPathParamRenderData, 0, len(paramNames))
			for _, paramName := range paramNames {
				if err := validateTSBindingIdentifier(
					fmt.Sprintf("route helper %s.%s path param", group.HelperConstName, route.Name),
					paramName,
				); err != nil {
					return nil, err
				}
				functionParams = append(functionParams, endpointPathParamRenderData{
					Name:     paramName,
					TypeExpr: "string",
				})
			}

			returnExpression := group.ConstName + "." + route.Name
			if len(paramNames) > 0 {
				returnExpression = fmt.Sprintf(
					"replaceGeneratedRoutePathParams(%s.%s, %s)",
					group.ConstName,
					route.Name,
					renderAddressParamsExpr(paramNames),
				)
			}

			helpers = append(helpers, routeHelperRenderData{
				Name:             route.Name,
				FunctionParams:   functionParams,
				ReturnExpression: returnExpression,
			})
		}
		if len(helpers) == 0 {
			continue
		}

		helperGroups = append(helperGroups, routeHelperGroupRenderData{
			ConstName: group.HelperConstName,
			Helpers:   helpers,
		})
	}
	return helperGroups, nil
}

func validateEndpointSpecs(routeGroups []RouteGroup, endpointSpecs []EndpointSpec) error {
	routeCollections, err := buildRouteCollectionLookup(routeGroups)
	if err != nil {
		return err
	}

	functionNames := make(map[string]EndpointSpec, len(endpointSpecs))
	routeMethods := make(map[string]EndpointSpec, len(endpointSpecs))

	for index, spec := range endpointSpecs {
		if spec.FunctionName == "" {
			return fmt.Errorf("endpoint at index %d has empty function name", index)
		}
		if err := validateTSBindingIdentifier("endpoint "+spec.FunctionName+": function name", spec.FunctionName); err != nil {
			return err
		}
		switch spec.Method {
		case "GET", "POST":
		default:
			return fmt.Errorf("endpoint %s: unsupported method %q", spec.FunctionName, spec.Method)
		}
		if spec.RouteCollection == "" {
			return fmt.Errorf("endpoint %s: route collection is empty", spec.FunctionName)
		}
		if spec.RouteName == "" {
			return fmt.Errorf("endpoint %s: route name is empty", spec.FunctionName)
		}
		if spec.BinaryResponse && spec.Method != "GET" {
			return fmt.Errorf("endpoint %s: binary responses require GET", spec.FunctionName)
		}

		routes, ok := routeCollections[spec.RouteCollection]
		if !ok {
			return fmt.Errorf("endpoint %s: unknown route collection %q", spec.FunctionName, spec.RouteCollection)
		}
		routePath, ok := routes[spec.RouteName]
		if !ok {
			return fmt.Errorf("endpoint %s: route %s.%s is not defined", spec.FunctionName, spec.RouteCollection, spec.RouteName)
		}
		if _, ok := generatedEndpointsImportContract.SupportedRouteCollections[spec.RouteCollection]; !ok {
			return fmt.Errorf(
				"endpoint %s: route collection %q is not supported by generated endpoints template",
				spec.FunctionName,
				spec.RouteCollection,
			)
		}
		if previousOrigin, exists := generatedEndpointsImportContract.ReservedValueSymbols[spec.FunctionName]; exists {
			return fmt.Errorf(
				"endpoint %s: function name conflicts with %s %q",
				spec.FunctionName,
				previousOrigin,
				spec.FunctionName,
			)
		}

		if err := validateEndpointPathParams(spec, routePath); err != nil {
			return err
		}

		if previous, exists := functionNames[spec.FunctionName]; exists {
			return fmt.Errorf(
				"duplicate endpoint function %q for %s %s.%s and %s %s.%s",
				spec.FunctionName,
				previous.Method,
				previous.RouteCollection,
				previous.RouteName,
				spec.Method,
				spec.RouteCollection,
				spec.RouteName,
			)
		}
		functionNames[spec.FunctionName] = spec

		routeMethodKey := spec.Method + " " + spec.RouteCollection + "." + spec.RouteName
		if previous, exists := routeMethods[routeMethodKey]; exists {
			return fmt.Errorf(
				"duplicate endpoint route binding %q for %s and %s",
				routeMethodKey,
				previous.FunctionName,
				spec.FunctionName,
			)
		}
		routeMethods[routeMethodKey] = spec
	}

	return nil
}

func validateEndpointPathParams(spec EndpointSpec, routePath string) error {
	routeParamNames := routePathParamNames(routePath)
	if spec.Method == "POST" && len(routeParamNames) > 0 && spec.PathParamsType == nil {
		return fmt.Errorf(
			"endpoint %s: POST route %s.%s has path params but no path params type",
			spec.FunctionName,
			spec.RouteCollection,
			spec.RouteName,
		)
	}
	if spec.RequestType != nil && spec.PathParamsType != nil && spec.Method == "GET" {
		return fmt.Errorf(
			"endpoint %s: GET endpoints cannot combine request and path params yet",
			spec.FunctionName,
		)
	}
	if spec.Method == "GET" && len(routeParamNames) > 0 && spec.PathParamsType == nil {
		if spec.RequestType == nil {
			return fmt.Errorf(
				"endpoint %s: GET route %s.%s has path params but neither path params type nor request type",
				spec.FunctionName,
				spec.RouteCollection,
				spec.RouteName,
			)
		}
		if err := validateRequestTypeRouteParams(spec.RequestType, routeParamNames); err != nil {
			return fmt.Errorf("endpoint %s: %w", spec.FunctionName, err)
		}
		return nil
	}
	if spec.PathParamsType == nil {
		return nil
	}
	if len(routeParamNames) == 0 {
		return fmt.Errorf(
			"endpoint %s: path params type provided for route %s.%s without route path params",
			spec.FunctionName,
			spec.RouteCollection,
			spec.RouteName,
		)
	}

	fields, err := endpointPathParamFields(spec.PathParamsType)
	if err != nil {
		return fmt.Errorf("endpoint %s: %w", spec.FunctionName, err)
	}
	fieldsByName := make(map[string]endpointPathParamField, len(fields))
	for _, field := range fields {
		fieldsByName[field.Name] = field
	}
	for _, routeParamName := range routeParamNames {
		if _, ok := fieldsByName[routeParamName]; !ok {
			return fmt.Errorf(
				"endpoint %s: path params type %s is missing route param %q",
				spec.FunctionName,
				pathParamsTypeLabel(spec.PathParamsType),
				routeParamName,
			)
		}
	}
	for _, field := range fields {
		if !slices.Contains(routeParamNames, field.Name) {
			return fmt.Errorf(
				"endpoint %s: path params type %s includes extra field %q not present in route %s",
				spec.FunctionName,
				pathParamsTypeLabel(spec.PathParamsType),
				field.Name,
				routePath,
			)
		}
	}

	return nil
}

func validateTypeDeclarations(declarations []TypeDeclaration) error {
	seenNames := make(map[string]string, len(declarations))
	typeSymbols := map[string]string{
		"ObjectValues":          "shared helper type alias",
		"GeneratedMutableValue": "shared helper type alias",
	}
	valueSymbols := map[string]string{
		"cloneGeneratedValue":   "shared helper function",
		"mergeGeneratedOptions": "shared helper function",
	}
	for index, declaration := range declarations {
		if declaration.Name == "" {
			return fmt.Errorf("declaration at index %d has empty name", index)
		}
		if err := validateTSBindingIdentifier("declaration "+declaration.Name, declaration.Name); err != nil {
			return err
		}
		switch declaration.Kind {
		case "object", "enum", "alias", "local_alias", "set", "type_guard", "function", "const":
		default:
			return fmt.Errorf("declaration %s: unsupported kind %q", declaration.Name, declaration.Kind)
		}
		if err := validateTypeDeclarationShape(declaration); err != nil {
			return err
		}
		if previousKind, exists := seenNames[declaration.Name]; exists {
			return fmt.Errorf(
				"duplicate declaration %q for kinds %q and %q",
				declaration.Name,
				previousKind,
				declaration.Kind,
			)
		}
		seenNames[declaration.Name] = declaration.Kind

		if err := recordEmittedSymbols(typeSymbols, emittedTypeSymbolsForDeclaration(declaration), "type"); err != nil {
			return err
		}
		if err := recordEmittedSymbols(valueSymbols, emittedValueSymbolsForDeclaration(declaration), "value"); err != nil {
			return err
		}
	}

	return nil
}

func emittedTypeSymbolsForDeclaration(declaration TypeDeclaration) []emittedSymbol {
	switch declaration.Kind {
	case "object", "enum", "alias", "local_alias":
		return []emittedSymbol{{
			Name:   declaration.Name,
			Origin: "declaration " + declaration.Name,
		}}
	default:
		return nil
	}
}

func emittedValueSymbolsForDeclaration(declaration TypeDeclaration) []emittedSymbol {
	symbols := make([]emittedSymbol, 0, 2)
	switch declaration.Kind {
	case "enum":
		symbols = append(symbols, emittedSymbol{
			Name:   declaration.Name + "Enum",
			Origin: "declaration " + declaration.Name + " enum helper",
		})
	case "object":
		if declaration.CreateExpr != "" || declaration.CreateBody != "" {
			symbols = append(symbols, emittedSymbol{
				Name:   "create" + declaration.Name,
				Origin: "declaration " + declaration.Name + " factory helper",
			})
		}
	case "alias":
		if declaration.CreateExpr != "" {
			symbols = append(symbols, emittedSymbol{
				Name:   "create" + declaration.Name,
				Origin: "declaration " + declaration.Name + " factory helper",
			})
		}
	case "set", "type_guard", "function", "const":
		symbols = append(symbols, emittedSymbol{
			Name:   declaration.Name,
			Origin: "declaration " + declaration.Name,
		})
	}
	return symbols
}

func recordEmittedSymbols(seen map[string]string, symbols []emittedSymbol, namespace string) error {
	for _, symbol := range symbols {
		if previousOrigin, exists := seen[symbol.Name]; exists {
			return fmt.Errorf(
				"%s symbol %q conflicts between %s and %s",
				namespace,
				symbol.Name,
				previousOrigin,
				symbol.Origin,
			)
		}
		seen[symbol.Name] = symbol.Origin
	}
	return nil
}

func validateTypeDeclarationShape(declaration TypeDeclaration) error {
	switch declaration.Kind {
	case "object":
		if declaration.CreateExpr != "" && declaration.CreateBody != "" {
			return fmt.Errorf("declaration %s: object cannot set both create expr and create body", declaration.Name)
		}
		if err := validateDeclarationProperties(declaration.Name, "property", declaration.Properties); err != nil {
			return err
		}
	case "enum":
		for index, value := range declaration.EnumValues {
			if value.Name == "" {
				return fmt.Errorf("declaration %s: enum value at index %d has empty name", declaration.Name, index)
			}
			if err := validateTSObjectLiteralPropertyName(
				fmt.Sprintf("declaration %s: enum value %q", declaration.Name, value.Name),
				value.Name,
			); err != nil {
				return err
			}
		}
	case "alias", "local_alias":
		if strings.TrimSpace(declaration.Alias) == "" {
			return fmt.Errorf("declaration %s: %s requires alias expression", declaration.Name, declaration.Kind)
		}
	case "set":
		if strings.TrimSpace(declaration.SetElementType) == "" {
			return fmt.Errorf("declaration %s: set requires element type", declaration.Name)
		}
		for index, member := range declaration.SetMembers {
			if strings.TrimSpace(member) == "" {
				return fmt.Errorf("declaration %s: set member at index %d is empty", declaration.Name, index)
			}
		}
	case "type_guard":
		if strings.TrimSpace(declaration.GuardInputType) == "" {
			return fmt.Errorf("declaration %s: type guard requires input type", declaration.Name)
		}
		if strings.TrimSpace(declaration.GuardReturnType) == "" {
			return fmt.Errorf("declaration %s: type guard requires return type", declaration.Name)
		}
		if strings.TrimSpace(declaration.GuardSetName) == "" {
			return fmt.Errorf("declaration %s: type guard requires backing set name", declaration.Name)
		}
	case "function":
		if strings.TrimSpace(declaration.FunctionReturn) == "" {
			return fmt.Errorf("declaration %s: function requires return type", declaration.Name)
		}
		if strings.TrimSpace(declaration.FunctionBody) == "" {
			return fmt.Errorf("declaration %s: function requires body", declaration.Name)
		}
		if err := validateDeclarationProperties(declaration.Name, "function parameter", declaration.FunctionParams); err != nil {
			return err
		}
		for _, param := range declaration.FunctionParams {
			if param.Optional && param.DefaultValue != "" {
				return fmt.Errorf(
					"declaration %s: function parameter %q cannot be optional and have a default value",
					declaration.Name,
					param.Name,
				)
			}
		}
	case "const":
		if strings.TrimSpace(declaration.ConstExpr) == "" {
			return fmt.Errorf("declaration %s: const requires expression", declaration.Name)
		}
	}

	return nil
}

func validateDeclarationProperties(declarationName string, propertyKind string, properties []TypeProperty) error {
	seenNames := make(map[string]struct{}, len(properties))
	for index, property := range properties {
		if property.Name == "" {
			return fmt.Errorf("declaration %s: %s at index %d has empty name", declarationName, propertyKind, index)
		}
		context := fmt.Sprintf("declaration %s: %s %q", declarationName, propertyKind, property.Name)
		if propertyKind == "function parameter" {
			if err := validateTSBindingIdentifier(context, property.Name); err != nil {
				return err
			}
		} else {
			if err := validateTSIdentifier(context, property.Name); err != nil {
				return err
			}
		}
		if strings.TrimSpace(property.TypeExpr) == "" {
			return fmt.Errorf("declaration %s: %s %q has empty type", declarationName, propertyKind, property.Name)
		}
		if _, exists := seenNames[property.Name]; exists {
			return fmt.Errorf("declaration %s: duplicate %s %q", declarationName, propertyKind, property.Name)
		}
		seenNames[property.Name] = struct{}{}
	}

	return nil
}

func validateTSIdentifier(context string, name string) error {
	if tsIdentifierPattern.MatchString(name) {
		return nil
	}
	return fmt.Errorf("%s must be a valid TypeScript identifier", context)
}

func validateTSBindingIdentifier(context string, name string) error {
	if err := validateTSIdentifier(context, name); err != nil {
		return err
	}
	if _, exists := tsReservedBindingKeywords[name]; exists {
		return fmt.Errorf("%s cannot use reserved TypeScript keyword %q", context, name)
	}
	return nil
}

func validateTSObjectLiteralPropertyName(context string, name string) error {
	if err := validateTSIdentifier(context, name); err != nil {
		return err
	}
	if name == "__proto__" {
		return fmt.Errorf("%s cannot be %q in generated object literals", context, name)
	}
	return nil
}

type endpointPathParamField struct {
	Name string
	Type reflect.Type
}

type endpointRequestField struct {
	Name     string
	Optional bool
	Type     reflect.Type
}

func buildRouteCollectionLookup(routeGroups []RouteGroup) (map[string]map[string]string, error) {
	collections := make(map[string]map[string]string, len(routeGroups))
	exportedValueSymbols := make(map[string]string, len(generatedRoutesReservedValueSymbols)+len(routeGroups)*2)
	for symbol, origin := range generatedRoutesReservedValueSymbols {
		exportedValueSymbols[symbol] = origin
	}
	enumNames := make(map[string]string)
	for _, group := range routeGroups {
		if group.ConstName == "" {
			return nil, fmt.Errorf("route group has empty const name")
		}
		if err := validateTSBindingIdentifier(
			fmt.Sprintf("route group %q const name", group.ConstName),
			group.ConstName,
		); err != nil {
			return nil, err
		}
		if previousOrigin, exists := exportedValueSymbols[group.ConstName]; exists {
			return nil, fmt.Errorf(
				"route group %q const name conflicts with %s %q",
				group.ConstName,
				previousOrigin,
				group.ConstName,
			)
		}
		exportedValueSymbols[group.ConstName] = "generated routes export"
		if _, exists := collections[group.ConstName]; exists {
			return nil, fmt.Errorf("duplicate route group %q", group.ConstName)
		}
		if group.HelperConstName != "" {
			if err := validateTSBindingIdentifier(
				fmt.Sprintf("route group %q helper const name", group.ConstName),
				group.HelperConstName,
			); err != nil {
				return nil, err
			}
			if previousOrigin, exists := exportedValueSymbols[group.HelperConstName]; exists {
				return nil, fmt.Errorf(
					"route group %q helper const name conflicts with %s %q",
					group.ConstName,
					previousOrigin,
					group.HelperConstName,
				)
			}
			exportedValueSymbols[group.HelperConstName] = "generated routes export"
		}
		routes := make(map[string]string, len(group.Routes))
		for _, route := range group.Routes {
			if route.Name == "" {
				return nil, fmt.Errorf("route group %q contains an empty route name", group.ConstName)
			}
			if err := validateTSObjectLiteralPropertyName(
				fmt.Sprintf("route group %q contains route %q", group.ConstName, route.Name),
				route.Name,
			); err != nil {
				return nil, err
			}
			if _, exists := routes[route.Name]; exists {
				return nil, fmt.Errorf("route group %q contains duplicate route %q", group.ConstName, route.Name)
			}
			if route.Path == "" {
				return nil, fmt.Errorf("route group %q route %q has empty path", group.ConstName, route.Name)
			}
			if route.EnumName != "" {
				if err := validateTSObjectLiteralPropertyName(
					fmt.Sprintf(
						"route group %q route %q enum name %q",
						group.ConstName,
						route.Name,
						route.EnumName,
					),
					route.EnumName,
				); err != nil {
					return nil, err
				}
				if previousPath, exists := enumNames[route.EnumName]; exists {
					return nil, fmt.Errorf(
						"duplicate route enum %q for paths %q and %q",
						route.EnumName,
						previousPath,
						route.Path,
					)
				}
				enumNames[route.EnumName] = route.Path
			}
			routes[route.Name] = route.Path
		}
		collections[group.ConstName] = routes
	}
	return collections, nil
}

func endpointPathParamFields(t reflect.Type) ([]endpointPathParamField, error) {
	if t == nil {
		return nil, nil
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		if t == nil {
			return nil, fmt.Errorf("path params type must be a named struct, got <nil>")
		}
		return nil, fmt.Errorf("path params type must be a named struct, got %s", t.String())
	}

	fields := make([]endpointPathParamField, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, optional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		if optional || field.Type.Kind() == reflect.Pointer {
			return nil, fmt.Errorf("path param field %s.%s cannot be optional", t.Name(), field.Name)
		}
		if err := validateTSBindingIdentifier(
			fmt.Sprintf("path params type %s field %q", t.Name(), name),
			name,
		); err != nil {
			return nil, err
		}
		fields = append(fields, endpointPathParamField{
			Name: name,
			Type: field.Type,
		})
	}
	if len(fields) == 0 {
		return nil, fmt.Errorf("path params type %s has no exported JSON fields", t.Name())
	}
	return fields, nil
}

func pathParamsTypeLabel(t reflect.Type) string {
	if t == nil {
		return "<nil>"
	}
	if name := frontendTypeName(t); name != "" {
		return name
	}
	return t.String()
}

func endpointRequestFields(t reflect.Type) ([]endpointRequestField, error) {
	if t == nil {
		return nil, nil
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		if t == nil {
			return nil, fmt.Errorf("request type must be a named struct, got <nil>")
		}
		return nil, fmt.Errorf("request type must be a named struct, got %s", t.String())
	}

	fields := make([]endpointRequestField, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, optional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		fields = append(fields, endpointRequestField{
			Name:     name,
			Optional: optional || field.Type.Kind() == reflect.Pointer,
			Type:     field.Type,
		})
	}
	if len(fields) == 0 {
		return nil, fmt.Errorf("request type %s has no exported JSON fields", t.Name())
	}
	return fields, nil
}

func validateRequestTypeRouteParams(t reflect.Type, routeParamNames []string) error {
	fields, err := endpointRequestFields(t)
	if err != nil {
		return err
	}

	fieldsByName := make(map[string]endpointRequestField, len(fields))
	for _, field := range fields {
		fieldsByName[field.Name] = field
	}

	typeName := frontendTypeName(t)
	for _, routeParamName := range routeParamNames {
		field, ok := fieldsByName[routeParamName]
		if !ok {
			return fmt.Errorf("request type %s is missing route param %q", typeName, routeParamName)
		}
		if field.Optional {
			return fmt.Errorf("request type %s route param %q cannot be optional", typeName, routeParamName)
		}
	}
	return nil
}

func routePathParamNames(routePath string) []string {
	matches := routePathParamPattern.FindAllStringSubmatch(routePath, -1)
	names := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		names = append(names, match[1])
	}
	return names
}

func flattenRouteEnumEntries(routeGroups []RouteGroup) []routeEnumEntry {
	entries := make([]routeEnumEntry, 0)
	for _, group := range routeGroups {
		for _, route := range group.Routes {
			if route.EnumName == "" {
				continue
			}
			entries = append(entries, routeEnumEntry{
				EnumName: route.EnumName,
				Path:     route.Path,
			})
		}
	}
	return entries
}

func frontendTypeName(t reflect.Type) string {
	if t == nil {
		return ""
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Name() == "" || t.PkgPath() == "" {
		return ""
	}
	return frontendBindingTypeName(t)
}

func tsTypeReference(t reflect.Type) string {
	if t == nil {
		return "null"
	}
	nullable := false
	for t.Kind() == reflect.Pointer {
		nullable = true
		t = t.Elem()
	}
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return "null"
	}
	ref := "null"
	if t.PkgPath() != "" && t.Name() != "" {
		ref = "gt." + frontendBindingTypeName(t)
	}
	if nullable && ref != "null" {
		return ref + " | null"
	}
	return ref
}

func renderTemplate(source string, data any) (string, error) {
	tmpl, err := template.New("").Option("missingkey=error").Parse(source)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}
	var out bytes.Buffer
	if err := tmpl.Execute(&out, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}
	return out.String(), nil
}
