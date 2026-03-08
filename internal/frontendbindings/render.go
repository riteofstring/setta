package frontendbindings

import (
	"bytes"
	_ "embed"
	"fmt"
	"reflect"
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
}

type routeEnumEntry struct {
	EnumName string
	Path     string
}

func Build() (GeneratedBindings, error) {
	converter := newTypeConverter()
	endpointSpecs := CurrentEndpoints()
	routeGroups := CurrentRouteGroups()
	renderEndpoints := make([]endpointRenderData, 0, len(endpointSpecs))
	for _, spec := range endpointSpecs {
		if err := converter.AddRootType(spec.RequestType); err != nil {
			return GeneratedBindings{}, err
		}
		if err := converter.AddRootType(spec.ResponseType); err != nil {
			return GeneratedBindings{}, err
		}

		requestTypeName := ""
		if spec.RequestType != nil {
			requestTypeName = namedTypeName(spec.RequestType)
		}

		renderEndpoints = append(renderEndpoints, endpointRenderData{
			FunctionName:    spec.FunctionName,
			Method:          spec.Method,
			RouteCollection: spec.RouteCollection,
			RouteName:       spec.RouteName,
			RequestTypeName: requestTypeName,
			ResponseTypeRef: tsTypeReference(spec.ResponseType),
			UsesRequest:     spec.RequestType != nil,
			UsesGet:         spec.Method == "GET",
		})
	}

	routesTS, err := renderTemplate(routesTemplateText, map[string]any{
		"RouteGroups":      routeGroups,
		"RouteEnumEntries": flattenRouteEnumEntries(routeGroups),
	})
	if err != nil {
		return GeneratedBindings{}, err
	}

	typesTS, err := renderTemplate(typesTemplateText, map[string]any{
		"Declarations": converter.Declarations(),
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

func namedTypeName(t reflect.Type) string {
	if t == nil {
		return ""
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
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
	tmpl, err := template.New("").Parse(source)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}
	var out bytes.Buffer
	if err := tmpl.Execute(&out, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}
	return out.String(), nil
}
