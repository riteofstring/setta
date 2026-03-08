package frontendbindings

import (
	"bytes"
	_ "embed"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"text/template"
)

//go:embed templates/routes.ts.tmpl
var routesTemplateText string

//go:embed templates/types.ts.tmpl
var typesTemplateText string

//go:embed templates/endpoints.ts.tmpl
var endpointsTemplateText string

type GeneratedBindings struct {
	RoutesTS    string
	TypesTS     string
	EndpointsTS string
}

type endpointRenderData struct {
	FunctionName    string
	Method          string
	RouteCollection string
	RouteName       string
	RequestTypeName string
	ResponseTypeRef string
	UsesRequest     bool
	UsesGet         bool
	UsesBinaryGet   bool
}

type routeEnumEntry struct {
	EnumName string
	Path     string
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

var generatedEndpointsImportContract = endpointImportContract{
	SupportedRouteCollections: map[string]struct{}{
		"GoHTTPRoutes": {},
	},
	ReservedValueSymbols: map[string]string{
		"get":          "generated endpoints import",
		"getBinary":    "generated endpoints import",
		"post":         "generated endpoints import",
		"GoHTTPRoutes": "generated endpoints import",
		"gt":           "generated endpoints import",
	},
}

var generatedRoutesReservedValueSymbols = map[string]string{
	"RouteEnum": "generated routes export",
}

func Build() (GeneratedBindings, error) {
	return buildBindings(
		CurrentRouteGroups(),
		CurrentEndpoints(),
		CurrentAdditionalTypeRoots(),
		CurrentAdditionalDeclarations(),
	)
}

func buildBindings(
	routeGroups []RouteGroup,
	endpointSpecs []EndpointSpec,
	extraTypes []reflect.Type,
	extraDeclarations []TypeDeclaration,
) (GeneratedBindings, error) {
	if err := validateEndpointSpecs(routeGroups, endpointSpecs); err != nil {
		return GeneratedBindings{}, err
	}

	converter := newTypeConverter()
	renderEndpoints := make([]endpointRenderData, 0, len(endpointSpecs))
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

		requestTypeName := ""
		if spec.RequestType != nil {
			requestTypeName = frontendTypeName(spec.RequestType)
		}

		renderEndpoints = append(renderEndpoints, endpointRenderData{
			FunctionName:    spec.FunctionName,
			Method:          spec.Method,
			RouteCollection: spec.RouteCollection,
			RouteName:       spec.RouteName,
			RequestTypeName: requestTypeName,
			ResponseTypeRef: tsTypeReference(spec.ResponseType),
			UsesRequest:     spec.RequestType != nil,
			UsesGet:         spec.Method == "GET" && !spec.BinaryResponse,
			UsesBinaryGet:   spec.Method == "GET" && spec.BinaryResponse,
		})
	}

	declarations := append(converter.Declarations(), extraDeclarations...)
	if err := validateTypeDeclarations(declarations); err != nil {
		return GeneratedBindings{}, err
	}

	routesTS, err := renderTemplate(routesTemplateText, map[string]any{
		"RouteGroups":      routeGroups,
		"RouteEnumEntries": flattenRouteEnumEntries(routeGroups),
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
		if !tsIdentifierPattern.MatchString(spec.FunctionName) {
			return fmt.Errorf("endpoint %s: function name must be a valid TypeScript identifier", spec.FunctionName)
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
		if _, ok := routes[spec.RouteName]; !ok {
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

		if spec.RequestType != nil && frontendTypeName(spec.RequestType) == "" {
			return fmt.Errorf("endpoint %s: request type must be a named Go type, got %s", spec.FunctionName, spec.RequestType.String())
		}
		if spec.ResponseType != nil && frontendTypeName(spec.ResponseType) == "" {
			return fmt.Errorf("endpoint %s: response type must be a named Go type, got %s", spec.FunctionName, spec.ResponseType.String())
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

func validateTypeDeclarations(declarations []TypeDeclaration) error {
	seenNames := make(map[string]string, len(declarations))
	typeSymbols := map[string]string{
		"ObjectValues":               "shared helper type alias",
		"GeneratedMutableValue":      "shared helper type alias",
		"GeneratedFactoryResolution": "shared helper type alias",
	}
	valueSymbols := map[string]string{
		"cloneGeneratedValue":                          "shared helper function",
		"mergeGeneratedOptions":                        "shared helper function",
		"isGeneratedImplOverrideCandidate":             "shared helper function",
		"resolveGeneratedFactoryInputs":                "shared helper function",
		"createGeneratedBaseSectionDefaults":           "shared helper function",
		"createGeneratedBaseSectionWithParamsDefaults": "shared helper function",
		"createGeneratedBaseCodeSectionDefaults":       "shared helper function",
	}
	for index, declaration := range declarations {
		if declaration.Name == "" {
			return fmt.Errorf("declaration at index %d has empty name", index)
		}
		if err := validateTSIdentifier("declaration "+declaration.Name, declaration.Name); err != nil {
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
		if err := validateTSIdentifier(
			fmt.Sprintf("declaration %s: %s %q", declarationName, propertyKind, property.Name),
			property.Name,
		); err != nil {
			return err
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

func validateTSObjectLiteralPropertyName(context string, name string) error {
	if err := validateTSIdentifier(context, name); err != nil {
		return err
	}
	if name == "__proto__" {
		return fmt.Errorf("%s cannot be %q in generated object literals", context, name)
	}
	return nil
}

func buildRouteCollectionLookup(routeGroups []RouteGroup) (map[string]map[string]struct{}, error) {
	collections := make(map[string]map[string]struct{}, len(routeGroups))
	enumNames := make(map[string]string)
	for _, group := range routeGroups {
		if group.ConstName == "" {
			return nil, fmt.Errorf("route group has empty const name")
		}
		if !tsIdentifierPattern.MatchString(group.ConstName) {
			return nil, fmt.Errorf("route group %q const name must be a valid TypeScript identifier", group.ConstName)
		}
		if previousOrigin, exists := generatedRoutesReservedValueSymbols[group.ConstName]; exists {
			return nil, fmt.Errorf(
				"route group %q const name conflicts with %s %q",
				group.ConstName,
				previousOrigin,
				group.ConstName,
			)
		}
		if _, exists := collections[group.ConstName]; exists {
			return nil, fmt.Errorf("duplicate route group %q", group.ConstName)
		}
		routes := make(map[string]struct{}, len(group.Routes))
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
			routes[route.Name] = struct{}{}
		}
		collections[group.ConstName] = routes
	}
	return collections, nil
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
	return t.Name()
}

func tsTypeReference(t reflect.Type) string {
	if t == nil {
		return "null"
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return "null"
	}
	if t.PkgPath() != "" && t.Name() != "" {
		return "gt." + t.Name()
	}
	return "null"
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
