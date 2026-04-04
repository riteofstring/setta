package httpapi

import "strings"

type RouteConstant struct {
	Name string
	Path string
}

var bareRouteNames = discoveredBareRouteNames()

func IsBareRouteName(value string) bool {
	_, ok := bareRouteNames[strings.TrimSpace(value)]
	return ok
}

func discoveredBareRouteNames() map[string]struct{} {
	names := make(map[string]struct{}, len(DiscoveredRouteConstants()))
	for _, route := range DiscoveredRouteConstants() {
		if strings.TrimSpace(route.Path) == "" {
			continue
		}
		names[bareRouteName(route.Path)] = struct{}{}
	}
	return names
}

func bareRouteName(route string) string {
	return strings.TrimPrefix(strings.TrimSpace(route), "/")
}
