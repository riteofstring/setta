package sharedtypes

import "reflect"

const (
	DefaultProfileFrontend     = "frontend"
	DefaultProfilePythonShared = "python_shared"
)

func DefaultValueProvidersByProfile() map[string]map[reflect.Type]func() any {
	return discoveredSharedDefaultValueProvidersByProfile()
}

func DefaultValueProviderForProfile(
	profile string,
	t reflect.Type,
) (func() any, bool) {
	t = canonicalType(t)
	if t == nil {
		return nil, false
	}
	providersByType, ok := DefaultValueProvidersByProfile()[profile]
	if !ok {
		return nil, false
	}
	provider, ok := providersByType[t]
	return provider, ok
}
