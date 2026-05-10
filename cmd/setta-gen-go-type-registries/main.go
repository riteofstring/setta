package main

import (
	"flag"
	"strings"

	"setta/internal/gotypediscovery"
	"setta/internal/plugins"
)

const sharedDefaultProviderOutputPath = "internal/sharedtypes/discovered_default_providers_gen.go"

const frontendValueExportOutputPath = "internal/sharedvalueexports/discovered_value_exports_gen.go"

const frontendValueExportPackage = "sharedvalueexports"

const appSubsystemProviderOutputPath = "internal/appsubsystemproviders/discovered_providers_gen.go"

type registrySource struct {
	PkgPath                  string
	RequireJSONTaggedStructs bool
	IncludeZeroFieldStructs  bool
	IncludeInterfaces        bool
	IncludeCollectionAliases bool
	IncludeNonStringScalars  bool
}

type registryTarget struct {
	OutputPath string
	Package    string
	FuncName   string
	Sources    []registrySource
	Comment    string
}

type registryEntry struct {
	Type    gotypediscovery.DiscoveredType
	PkgPath string
}

func frontendConvertibleRegistrySource(pkgPath string) registrySource {
	return registrySource{
		PkgPath:                  pkgPath,
		RequireJSONTaggedStructs: true,
		IncludeZeroFieldStructs:  true,
		IncludeCollectionAliases: true,
		IncludeNonStringScalars:  true,
	}
}

type defaultProviderEntry struct {
	Target              registryEntry
	ProviderPackagePath string
	ProviderFuncName    string
}

type defaultProviderProfile struct {
	Name           string
	FunctionPrefix string
}

type frontendValueExportEntry struct {
	Name                string
	ProviderPackagePath string
	ProviderFuncName    string
}

type appSubsystemProviderEntry struct {
	PluginID     string
	Capabilities plugins.PluginAppSubsystemFeatureManifest
}

type frontendTypeIndexes struct {
	LocalNames  map[string][]registryEntry
	TargetNames map[string]map[string]registryEntry
}

func preferNormalizedRegistryEntry(
	existing registryEntry,
	candidate registryEntry,
) (registryEntry, bool) {
	existingFrontend := strings.HasPrefix(strings.TrimSpace(existing.Type.Name), "Frontend")
	candidateFrontend := strings.HasPrefix(strings.TrimSpace(candidate.Type.Name), "Frontend")
	switch {
	case existingFrontend && !candidateFrontend:
		return existing, true
	case !existingFrontend && candidateFrontend:
		return candidate, true
	default:
		return registryEntry{}, false
	}
}

var skippedFrontendDefaultProviderTypes = map[string]struct{}{
	"CodeParamCodeObjImpl": {},
}

var sharedDefaultProviderProfiles = []defaultProviderProfile{
	{
		Name:           "frontend",
		FunctionPrefix: "FrontendDefault",
	},
	{
		Name:           "python_shared",
		FunctionPrefix: "PythonSharedDefault",
	},
}

func main() {
	write := flag.Bool("write", true, "write generated registry files")
	flag.Parse()

	pluginAppDefinitionPackages, err := pluginAppDefinitionPackagePaths()
	if err != nil {
		fail("discover plugin app definition packages: %v", err)
	}

	targets := buildRegistryTargets(pluginAppDefinitionPackages)
	frontendDefaultProviderEntries, err := writeRegistryTargets(targets, *write)
	if err != nil {
		fail("%v", err)
	}

	if err := writeSharedDefaultProviderRegistry(frontendDefaultProviderEntries, *write); err != nil {
		fail("write %s: %v", sharedDefaultProviderOutputPath, err)
	}
	if err := writeFrontendValueExportRegistry(*write); err != nil {
		fail("write %s: %v", frontendValueExportOutputPath, err)
	}
	if err := writeFrontendContractNameRegistry(*write); err != nil {
		fail("write %s: %v", frontendContractNamesOutputPath, err)
	}

	appSubsystemProviders, err := appSubsystemProviders()
	if err != nil {
		fail("discover app subsystem providers: %v", err)
	}
	if err := writeAppSubsystemProviderRegistry(appSubsystemProviders, *write); err != nil {
		fail("write %s: %v", appSubsystemProviderOutputPath, err)
	}
}
