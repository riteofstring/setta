package frontendbindings

import (
	"strings"
	"unicode"

	"setta/internal/httpapi"
	"setta/internal/wsapi"
)

var discoveredRouteNameOverrides = map[string][]string{
	"RouteAPIPrefix":                 {"api"},
	"RouteGetAIFollowSnapshot":       {"getAIFollowSnapshot"},
	"RouteGetFileBrowserDownloadURL": {"getFileBrowserDownloadUrls"},
	"RouteLLMAPIKeys":                {"getLLMAPIKeys", "setLLMAPIKeys"},
	"RouteLLMConfig":                 {"getLLMConfig", "setLLMConfig"},
	"RouteMCPServerRuntimeStatus":    {"getMCPServerRuntimeStatus"},
	"RouteMCPToolCall":               {"toolsCall"},
	"RoutePluginsAssetWildcard":      {"pluginAssetWildcard"},
	"RouteSetSocialURL":              {"setSocialURL"},
	"RouteWriteFileBrowserContent":   {"writeFileBrowserFileContent"},
}

var preservedRouteAcronyms = map[string]struct{}{
	"AI":  {},
	"API": {},
	"LLM": {},
	"MCP": {},
}

func discoveredCurrentRouteGroups() []RouteGroup {
	return []RouteGroup{
		{
			ConstName:       "GoRoutePrefixes",
			HelperConstName: "GoRoutePrefixHelpers",
			Routes: namedHTTPRoutes(
				func(route httpapi.RouteConstant) bool {
					return route.Name == "RouteAPIPrefix"
				},
			),
		},
		{
			ConstName:       "GoRootRoutes",
			HelperConstName: "GoRootRouteHelpers",
			Routes: namedHTTPRoutes(
				func(route httpapi.RouteConstant) bool {
					return strings.HasPrefix(route.Path, "/__setta__/")
				},
			),
		},
		{
			ConstName: "GoPluginRootRoutes",
			Routes: namedHTTPRoutes(
				func(route httpapi.RouteConstant) bool {
					return route.Name == "RoutePluginsAssetWildcard"
				},
			),
		},
		{
			ConstName:       "GoHTTPRoutes",
			HelperConstName: "GoHTTPRouteHelpers",
			Routes: namedHTTPRoutes(
				func(route httpapi.RouteConstant) bool {
					if route.Name == "RouteAPIPrefix" {
						return false
					}
					if strings.HasPrefix(route.Path, "/__setta__/") {
						return false
					}
					if route.Name == "RoutePluginsAssetWildcard" {
						return false
					}
					return true
				},
			),
		},
		{
			ConstName:       "GoWebsocketRoutes",
			HelperConstName: "GoWebsocketRouteHelpers",
			Routes:          namedWSRoutes(),
		},
	}
}

func namedHTTPRoutes(include func(httpapi.RouteConstant) bool) []NamedRoute {
	routes := make([]NamedRoute, 0, len(httpapi.DiscoveredRouteConstants()))
	for _, route := range httpapi.DiscoveredRouteConstants() {
		if include != nil && !include(route) {
			continue
		}
		routes = append(routes, namedRoutesForConstant(route.Name, route.Path)...)
	}
	return routes
}

func namedWSRoutes() []NamedRoute {
	routes := make([]NamedRoute, 0, len(wsapi.DiscoveredRouteConstants()))
	for _, route := range wsapi.DiscoveredRouteConstants() {
		routes = append(routes, namedRoutesForConstant(route.Name, route.Path)...)
	}
	return routes
}

func namedRoutesForConstant(constName string, path string) []NamedRoute {
	names, ok := discoveredRouteNameOverrides[constName]
	if !ok {
		names = []string{routeNameFromConstant(constName)}
	}
	routes := make([]NamedRoute, 0, len(names))
	for _, name := range names {
		routes = append(routes, NamedRoute{
			Name:     name,
			Path:     path,
			EnumName: routeEnumName(name),
		})
	}
	return routes
}

func routeNameFromConstant(constName string) string {
	base := strings.TrimPrefix(strings.TrimSpace(constName), "Route")
	words := splitFrontendBindingIdentifierWords(base)
	if len(words) == 0 {
		return ""
	}

	var builder strings.Builder
	for index, word := range words {
		if index == 0 {
			builder.WriteString(strings.ToLower(word))
			continue
		}
		upper := strings.ToUpper(word)
		if _, ok := preservedRouteAcronyms[upper]; ok {
			builder.WriteString(upper)
			continue
		}
		lower := strings.ToLower(word)
		builder.WriteString(strings.ToUpper(lower[:1]))
		builder.WriteString(lower[1:])
	}
	return builder.String()
}

func routeEnumName(routeName string) string {
	normalized := strings.TrimSpace(routeName)
	if normalized == "" {
		return ""
	}
	words := splitFrontendBindingIdentifierWords(strings.ToUpper(normalized[:1]) + normalized[1:])
	if len(words) == 0 {
		return ""
	}
	for index, word := range words {
		words[index] = strings.ToUpper(word)
	}
	return strings.Join(words, "_")
}

func splitFrontendBindingIdentifierWords(value string) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	runes := []rune(trimmed)
	words := make([]string, 0, len(runes))
	for index := 0; index < len(runes); {
		start := index
		if unicode.IsUpper(runes[index]) {
			for index < len(runes) && unicode.IsUpper(runes[index]) {
				index++
			}
			if index < len(runes) && unicode.IsLower(runes[index]) {
				if index-start > 1 {
					if index+1 == len(runes) && unicode.ToLower(runes[index]) == 's' {
						words = append(words, string(runes[start:index+1]))
						index++
						continue
					}
					words = append(words, string(runes[start:index-1]))
					index--
					continue
				}
				index++
				for index < len(runes) && (unicode.IsLower(runes[index]) || unicode.IsDigit(runes[index])) {
					index++
				}
				words = append(words, string(runes[start:index]))
				continue
			}
			words = append(words, string(runes[start:index]))
			continue
		}

		index++
		for index < len(runes) && (unicode.IsLower(runes[index]) || unicode.IsDigit(runes[index])) {
			index++
		}
		words = append(words, string(runes[start:index]))
	}
	return words
}
