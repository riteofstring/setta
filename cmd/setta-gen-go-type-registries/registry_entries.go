package main

import (
	"fmt"
	"strings"

	"setta/internal/gotypediscovery"
)

func discoverRegistryEntries(target registryTarget) ([]registryEntry, error) {
	seenEntries := map[string]struct{}{}
	entries := []registryEntry{}
	for _, source := range target.Sources {
		discovered, err := gotypediscovery.DiscoverPackageTypesWithOptions(
			source.PkgPath,
			gotypediscovery.DiscoverOptions{
				RequireJSONTaggedStructs: source.RequireJSONTaggedStructs,
				IncludeZeroFieldStructs:  source.IncludeZeroFieldStructs,
				IncludeInterfaces:        source.IncludeInterfaces,
				IncludeCollectionAliases: source.IncludeCollectionAliases,
				IncludeNonStringScalars:  source.IncludeNonStringScalars,
			},
		)
		if err != nil {
			return nil, fmt.Errorf("discover %s: %w", source.PkgPath, err)
		}
		for _, discoveredType := range discovered {
			key := source.PkgPath + "\x00" + discoveredType.Name
			if _, alreadySeen := seenEntries[key]; alreadySeen {
				continue
			}
			seenEntries[key] = struct{}{}
			entries = append(entries, registryEntry{
				Type:    discoveredType,
				PkgPath: source.PkgPath,
			})
		}
	}
	for _, extraEntry := range explicitRegistryEntries(target) {
		key := extraEntry.PkgPath + "\x00" + extraEntry.Type.Name
		if _, alreadySeen := seenEntries[key]; alreadySeen {
			continue
		}
		seenEntries[key] = struct{}{}
		entries = append(entries, extraEntry)
	}
	return entries, nil
}

func explicitRegistryEntries(target registryTarget) []registryEntry {
	switch {
	case target.Package == "frontendbindings" && target.FuncName == "DiscoveredConvertibleTypes":
		return []registryEntry{
			{
				PkgPath: "setta/internal/projectstate",
				Type: gotypediscovery.DiscoveredType{
					Name: "FrontendTerminalSectionImpl",
					Kind: gotypediscovery.TypeKindStruct,
				},
			},
			{
				PkgPath: "setta/internal/projectstate",
				Type: gotypediscovery.DiscoveredType{
					Name: "FrontendCodeParamCodeObjImpl",
					Kind: gotypediscovery.TypeKindStruct,
				},
			},
		}
	case target.Package == "sharedtypes" && target.FuncName == "discoveredAdditionalTypes":
		return []registryEntry{
			{
				PkgPath: "setta/internal/artifacts",
				Type: gotypediscovery.DiscoveredType{
					Name: "BaseArtifactUnion",
					Kind: gotypediscovery.TypeKindStruct,
				},
			},
			{
				PkgPath: "setta/internal/realtime",
				Type: gotypediscovery.DiscoveredType{
					Name: "BaseDependencyKeyUnion",
					Kind: gotypediscovery.TypeKindStruct,
				},
			},
			{
				PkgPath: "setta/internal/realtime",
				Type: gotypediscovery.DiscoveredType{
					Name: "BaseDependencyValueUnion",
					Kind: gotypediscovery.TypeKindStruct,
				},
			},
		}
	default:
		return nil
	}
}

func renderRegistry(target registryTarget, entries []registryEntry) string {
	var builder strings.Builder
	builder.WriteString("// ")
	builder.WriteString(target.Comment)
	builder.WriteString("\n\n")
	builder.WriteString("package ")
	builder.WriteString(target.Package)
	builder.WriteString("\n\n")
	importPaths := externalImportPaths(target, entries)
	if len(importPaths) == 0 {
		builder.WriteString("import \"reflect\"\n\n")
	} else {
		builder.WriteString("import (\n")
		builder.WriteString("\t\"reflect\"\n")
		importAliases := buildImportAliases(target, entries)
		for _, importPath := range importPaths {
			builder.WriteString("\t")
			builder.WriteString(importAliases[importPath])
			builder.WriteString(" ")
			builder.WriteString(fmt.Sprintf("%q", importPath))
			builder.WriteString("\n")
		}
		builder.WriteString(")\n\n")
	}
	builder.WriteString("func ")
	builder.WriteString(target.FuncName)
	builder.WriteString("() []reflect.Type {\n")
	builder.WriteString("\treturn []reflect.Type{\n")
	importAliases := buildImportAliases(target, entries)
	for _, entry := range entries {
		builder.WriteString("\t\t")
		builder.WriteString(renderReflectExpr(entry, importAliases))
		builder.WriteString(",\n")
	}
	builder.WriteString("\t}\n")
	builder.WriteString("}\n")
	return builder.String()
}
