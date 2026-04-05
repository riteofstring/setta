package sharedtypes

import "reflect"

func DiscoveredAdditionalTypesForGeneration() []reflect.Type {
	return discoveredAdditionalTypes()
}
