package main

import (
	"flag"
	"fmt"
	"os"
	"path"
	"sort"
	"strings"

	"setta/internal/gotypediscovery"
)

const frontendDefaultProviderOutputPath = "internal/frontendbindings/discovered_default_providers_gen.go"

type registrySource struct {
	PkgPath                  string
	RequireJSONTaggedStructs bool
	IncludeZeroFieldStructs  bool
	IncludeInterfaces        bool
	IncludeCollectionAliases bool
	IncludeNonStringScalars  bool
}

type registryTarget struct {
	OutputPath       string
	Package          string
	FuncName         string
	TypeOverrideFunc string
	Sources          []registrySource
	Comment          string
}

type registryEntry struct {
	Type    gotypediscovery.DiscoveredType
	PkgPath string
}

type defaultProviderEntry struct {
	Target              registryEntry
	ProviderPackagePath string
	ProviderFuncName    string
}

type frontendTypeIndexes struct {
	LocalNames  map[string][]registryEntry
	TargetNames map[string]map[string]registryEntry
}

func preferNormalizedFrontendRegistryEntry(
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
	case existing.PkgPath == "setta/internal/frontendbindings" &&
		candidate.PkgPath != "setta/internal/frontendbindings":
		return existing, true
	case existing.PkgPath != "setta/internal/frontendbindings" &&
		candidate.PkgPath == "setta/internal/frontendbindings":
		return candidate, true
	default:
		return registryEntry{}, false
	}
}

var skippedFrontendDefaultProviderTypes = map[string]struct{}{
	"CodeParamCodeObjImpl": {},
}

func main() {
	write := flag.Bool("write", true, "write generated registry files")
	flag.Parse()

	targets := []registryTarget{
		{
			OutputPath:       "internal/frontendbindings/discovered_type_roots_gen.go",
			Package:          "frontendbindings",
			FuncName:         "DiscoveredConvertibleTypes",
			TypeOverrideFunc: "DiscoveredTypeOverrides",
			Sources: []registrySource{
				{
					PkgPath:                  "setta/internal/plugins",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/frontendbindings",
					IncludeZeroFieldStructs:  true,
					IncludeInterfaces:        true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/agentprofiles",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/agentruns",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/detachedruns",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/externalagentconfigs",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/llmconfig",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/projectstate",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/agenticsummarycache",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/artifacts",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/projectview",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/prompttemplates",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/settingsstate",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/scriptablechat",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/realtime",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/wsapi",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/transcriptionprofiles",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/lspcompletion",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/projectshell",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/gitread",
					RequireJSONTaggedStructs: true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
			},
			Comment: "Code generated by ./scripts/go.sh run ./cmd/setta-gen-go-type-registries; DO NOT EDIT.",
		},
		{
			OutputPath: "internal/frontendbindings/discovered_endpoint_contract_types_gen.go",
			Package:    "frontendbindings",
			FuncName:   "DiscoveredEndpointContractTypes",
			Sources: []registrySource{
				{
					PkgPath:                  "setta/internal/httpapi",
					IncludeZeroFieldStructs:  true,
					IncludeInterfaces:        true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/appgenskills",
					IncludeZeroFieldStructs:  true,
					IncludeInterfaces:        true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
				{
					PkgPath:                  "setta/internal/pythonsdkcontracts",
					IncludeZeroFieldStructs:  true,
					IncludeInterfaces:        true,
					IncludeCollectionAliases: true,
					IncludeNonStringScalars:  true,
				},
			},
			Comment: "Code generated by ./scripts/go.sh run ./cmd/setta-gen-go-type-registries; DO NOT EDIT.",
		},
		{
			OutputPath: "internal/pythonsdkcontracts/discovered_contract_types_gen.go",
			Package:    "pythonsdkcontracts",
			FuncName:   "discoveredContractTypes",
			Sources: []registrySource{{
				PkgPath:                  "setta/internal/pythonsdkcontracts",
				IncludeZeroFieldStructs:  true,
				IncludeInterfaces:        true,
				IncludeCollectionAliases: true,
				IncludeNonStringScalars:  true,
			}},
			Comment: "Code generated by ./scripts/go.sh run ./cmd/setta-gen-go-type-registries; DO NOT EDIT.",
		},
		{
			OutputPath: "internal/pythonsharedtypes/discovered_shared_types_gen.go",
			Package:    "pythonsharedtypes",
			FuncName:   "discoveredSharedTypes",
			Sources: []registrySource{
				{
					PkgPath:                  "setta/internal/binary",
					RequireJSONTaggedStructs: true,
				},
				{
					PkgPath:                  "setta/internal/projectstate",
					RequireJSONTaggedStructs: true,
				},
				{
					PkgPath:                  "setta/internal/realtime",
					RequireJSONTaggedStructs: true,
				},
				{
					PkgPath:                  "setta/internal/artifacts",
					RequireJSONTaggedStructs: true,
				},
				{
					PkgPath:                  "setta/internal/scriptablechat",
					RequireJSONTaggedStructs: true,
				},
				{
					PkgPath:                  "setta/internal/projectview",
					RequireJSONTaggedStructs: true,
				},
				{
					PkgPath:                  "setta/internal/pythonsdkcontracts",
					RequireJSONTaggedStructs: true,
				},
			},
			Comment: "Code generated by ./scripts/go.sh run ./cmd/setta-gen-go-type-registries; DO NOT EDIT.",
		},
	}

	var frontendDefaultProviderEntries []registryEntry
	for _, target := range targets {
		entries, err := discoverRegistryEntries(target)
		if err != nil {
			fail("discover %s: %v", target.OutputPath, err)
		}
		if target.OutputPath == "internal/frontendbindings/discovered_type_roots_gen.go" ||
			target.OutputPath == "internal/frontendbindings/discovered_endpoint_contract_types_gen.go" {
			frontendDefaultProviderEntries = append(frontendDefaultProviderEntries, entries...)
		}
		contents := renderRegistry(target, entries)
		if !*write {
			fmt.Printf("== %s ==\n%s\n", target.OutputPath, contents)
			continue
		}
		if err := os.WriteFile(target.OutputPath, []byte(contents), 0o644); err != nil {
			fail("write %s: %v", target.OutputPath, err)
		}
	}

	if err := writeFrontendDefaultProviderRegistry(frontendDefaultProviderEntries, *write); err != nil {
		fail("write %s: %v", frontendDefaultProviderOutputPath, err)
	}
}

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
	if target.Package != "frontendbindings" || target.FuncName != "DiscoveredConvertibleTypes" {
		return nil
	}
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
	if target.TypeOverrideFunc != "" {
		overrideEntries := buildTypeOverrideEntries(target, entries)
		builder.WriteString("\n")
		builder.WriteString("func ")
		builder.WriteString(target.TypeOverrideFunc)
		builder.WriteString("() map[reflect.Type]reflect.Type {\n")
		builder.WriteString("\treturn map[reflect.Type]reflect.Type{\n")
		for _, entry := range overrideEntries {
			builder.WriteString("\t\t")
			builder.WriteString(renderReflectExpr(entry, importAliases))
			builder.WriteString(": ")
			builder.WriteString(renderTargetReflectExpr(entry, importAliases))
			builder.WriteString(",\n")
		}
		builder.WriteString("\t}\n")
		builder.WriteString("}\n")
	}
	return builder.String()
}

func writeFrontendDefaultProviderRegistry(
	frontendEntries []registryEntry,
	write bool,
) error {
	if len(frontendEntries) == 0 {
		return fmt.Errorf("missing frontend registry entries")
	}
	providers, err := discoverFrontendDefaultProviderEntries(frontendEntries)
	if err != nil {
		return err
	}
	contents := renderFrontendDefaultProviderRegistry(providers)
	if !write {
		fmt.Printf("== %s ==\n%s\n", frontendDefaultProviderOutputPath, contents)
		return nil
	}
	return os.WriteFile(frontendDefaultProviderOutputPath, []byte(contents), 0o644)
}

func discoverFrontendDefaultProviderEntries(
	frontendEntries []registryEntry,
) ([]defaultProviderEntry, error) {
	indexes, err := normalizedFrontendTypeIndex(frontendEntries)
	if err != nil {
		return nil, err
	}

	providersByTarget := map[string]defaultProviderEntry{}
	for _, pkgPath := range frontendDefaultProviderSourcePackages(frontendEntries) {
		functions, err := gotypediscovery.DiscoverPackageZeroArgFunctionsWithPrefix(
			pkgPath,
			"FrontendDefault",
		)
		if err != nil {
			return nil, fmt.Errorf("discover default providers in %s: %w", pkgPath, err)
		}
		for _, function := range functions {
			suffix := strings.TrimPrefix(function.Name, "FrontendDefault")
			key := normalizedRegistryName(suffix)
			target, ok := selectFrontendLocalType(indexes.LocalNames[key], pkgPath)
			if !ok {
				targetsByPackage := indexes.TargetNames[pkgPath]
				target, ok = targetsByPackage[key]
			}
			if !ok {
				continue
			}
			if _, skipped := skippedFrontendDefaultProviderTypes[target.Type.Name]; skipped {
				continue
			}
			entry := defaultProviderEntry{
				Target:              target,
				ProviderPackagePath: pkgPath,
				ProviderFuncName:    function.Name,
			}
			if existing, ok := providersByTarget[target.Type.Name]; ok &&
				(existing.ProviderPackagePath != entry.ProviderPackagePath ||
					existing.ProviderFuncName != entry.ProviderFuncName) {
				return nil, fmt.Errorf(
					"multiple default providers discovered for %s: %s.%s and %s.%s",
					target.Type.Name,
					existing.ProviderPackagePath,
					existing.ProviderFuncName,
					entry.ProviderPackagePath,
					entry.ProviderFuncName,
				)
			}
			providersByTarget[target.Type.Name] = entry
		}
	}

	providers := make([]defaultProviderEntry, 0, len(providersByTarget))
	for _, entry := range providersByTarget {
		providers = append(providers, entry)
	}
	sort.Slice(providers, func(i, j int) bool {
		return providers[i].Target.Type.Name < providers[j].Target.Type.Name
	})
	return providers, nil
}

func normalizedFrontendTypeIndex(
	frontendEntries []registryEntry,
) (frontendTypeIndexes, error) {
	indexes := frontendTypeIndexes{
		LocalNames:  map[string][]registryEntry{},
		TargetNames: map[string]map[string]registryEntry{},
	}
	for _, entry := range frontendEntries {
		key := normalizedRegistryName(entry.Type.Name)
		recordLocalFrontendType(&indexes, key, entry)
		targetPkgPath := strings.TrimSpace(entry.Type.TargetPackagePath)
		targetTypeName := normalizedRegistryName(entry.Type.TargetTypeName)
		if targetPkgPath == "" || targetTypeName == "" {
			continue
		}
		recordTargetFrontendType(&indexes, targetPkgPath, targetTypeName, entry)
	}
	return indexes, nil
}

func recordLocalFrontendType(
	indexes *frontendTypeIndexes,
	key string,
	entry registryEntry,
) {
	existing := indexes.LocalNames[key]
	for _, candidate := range existing {
		if candidate.PkgPath == entry.PkgPath && candidate.Type.Name == entry.Type.Name {
			return
		}
	}
	indexes.LocalNames[key] = append(existing, entry)
}

func recordTargetFrontendType(
	indexes *frontendTypeIndexes,
	targetPkgPath string,
	targetTypeName string,
	entry registryEntry,
) {
	targetsByPackage, ok := indexes.TargetNames[targetPkgPath]
	if !ok {
		targetsByPackage = map[string]registryEntry{}
		indexes.TargetNames[targetPkgPath] = targetsByPackage
	}
	existing, ok := targetsByPackage[targetTypeName]
	if !ok || existing.Type.Name == entry.Type.Name {
		targetsByPackage[targetTypeName] = entry
		return
	}
	if preferred, resolved := preferNormalizedFrontendRegistryEntry(existing, entry); resolved {
		targetsByPackage[targetTypeName] = preferred
		return
	}
	if existing.PkgPath == entry.PkgPath {
		return
	}
	delete(targetsByPackage, targetTypeName)
}

func selectFrontendLocalType(
	entries []registryEntry,
	providerPkgPath string,
) (registryEntry, bool) {
	if len(entries) == 0 {
		return registryEntry{}, false
	}
	if providerPkgPath != "" {
		for _, entry := range entries {
			if entry.PkgPath == providerPkgPath {
				return entry, true
			}
		}
	}
	if len(entries) == 1 {
		return entries[0], true
	}
	preferred := entries[0]
	resolved := false
	for _, candidate := range entries[1:] {
		if next, ok := preferNormalizedFrontendRegistryEntry(preferred, candidate); ok {
			preferred = next
			resolved = true
			continue
		}
		return registryEntry{}, false
	}
	return preferred, resolved
}

func frontendDefaultProviderSourcePackages(frontendEntries []registryEntry) []string {
	packages := []string{"setta/internal/frontendbindings"}
	seen := map[string]struct{}{
		"setta/internal/frontendbindings": {},
	}
	for _, entry := range frontendEntries {
		for _, pkgPath := range []string{entry.PkgPath, entry.Type.TargetPackagePath} {
			pkgPath = strings.TrimSpace(pkgPath)
			if pkgPath == "" || !strings.HasPrefix(pkgPath, "setta/internal/") {
				continue
			}
			if _, ok := seen[pkgPath]; ok {
				continue
			}
			seen[pkgPath] = struct{}{}
			packages = append(packages, pkgPath)
		}
	}
	sort.Strings(packages)
	return packages
}

func normalizedRegistryName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, "Frontend") && len(name) > len("Frontend") {
		name = strings.TrimPrefix(name, "Frontend")
	}
	return strings.ToLower(name)
}

func renderFrontendDefaultProviderRegistry(entries []defaultProviderEntry) string {
	var builder strings.Builder
	builder.WriteString("// Code generated by ./scripts/go.sh run ./cmd/setta-gen-go-type-registries; DO NOT EDIT.\n\n")
	builder.WriteString("package frontendbindings\n\n")

	importPaths := frontendDefaultProviderImportPaths(entries)
	if len(importPaths) == 0 {
		builder.WriteString("import \"reflect\"\n\n")
	} else {
		builder.WriteString("import (\n")
		builder.WriteString("\t\"reflect\"\n")
		importAliases := buildImportAliasesForPaths("frontendbindings", importPaths)
		for _, importPath := range importPaths {
			builder.WriteString("\t")
			builder.WriteString(importAliases[importPath])
			builder.WriteString(" ")
			builder.WriteString(fmt.Sprintf("%q", importPath))
			builder.WriteString("\n")
		}
		builder.WriteString(")\n\n")
	}

	builder.WriteString("func discoveredFrontendDefaultValueProviders() map[reflect.Type]func() any {\n")
	builder.WriteString("\treturn map[reflect.Type]func() any{\n")
	importAliases := buildImportAliasesForPaths("frontendbindings", importPaths)
	for _, entry := range entries {
		builder.WriteString("\t\t")
		builder.WriteString(renderReflectExpr(entry.Target, importAliases))
		builder.WriteString(": func() any {\n")
		builder.WriteString("\t\t\treturn ")
		builder.WriteString(renderDefaultProviderCall(entry, importAliases))
		builder.WriteString("\n")
		builder.WriteString("\t\t},\n")
	}
	builder.WriteString("\t}\n")
	builder.WriteString("}\n")
	return builder.String()
}

func frontendDefaultProviderImportPaths(entries []defaultProviderEntry) []string {
	imports := []string{}
	seen := map[string]struct{}{}
	for _, entry := range entries {
		for _, importPath := range []string{entry.ProviderPackagePath, entry.Target.PkgPath} {
			if importPath == "setta/internal/frontendbindings" || strings.TrimSpace(importPath) == "" {
				continue
			}
			if _, ok := seen[importPath]; ok {
				continue
			}
			seen[importPath] = struct{}{}
			imports = append(imports, importPath)
		}
	}
	sort.Strings(imports)
	return imports
}

func buildImportAliasesForPaths(targetPackage string, importPaths []string) map[string]string {
	aliases := map[string]string{}
	used := map[string]struct{}{
		targetPackage: {},
	}
	for _, importPath := range importPaths {
		base := strings.TrimSpace(path.Base(importPath))
		alias := sanitizeAlias(base)
		if alias == "" {
			alias = "pkg"
		}
		candidate := alias
		suffix := 2
		for {
			if _, exists := used[candidate]; !exists {
				break
			}
			candidate = fmt.Sprintf("%s%d", alias, suffix)
			suffix++
		}
		used[candidate] = struct{}{}
		aliases[importPath] = candidate
	}
	return aliases
}

func renderDefaultProviderCall(
	entry defaultProviderEntry,
	importAliases map[string]string,
) string {
	qualifiedName := entry.ProviderFuncName
	if alias := importAliases[entry.ProviderPackagePath]; alias != "" {
		qualifiedName = alias + "." + qualifiedName
	}
	return qualifiedName + "()"
}

var reflectExprBuilders = map[gotypediscovery.TypeKind]func(string) string{
	gotypediscovery.TypeKindArray: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s{})", name)
	},
	gotypediscovery.TypeKindBool: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(false))", name)
	},
	gotypediscovery.TypeKindFloat: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(0))", name)
	},
	gotypediscovery.TypeKindStruct: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s{})", name)
	},
	gotypediscovery.TypeKindInterface: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf((*%s)(nil)).Elem()", name)
	},
	gotypediscovery.TypeKindInt: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(0))", name)
	},
	gotypediscovery.TypeKindMap: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(nil))", name)
	},
	gotypediscovery.TypeKindNamed: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf((*%s)(nil)).Elem()", name)
	},
	gotypediscovery.TypeKindSlice: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(nil))", name)
	},
	gotypediscovery.TypeKindString: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(\"\"))", name)
	},
	gotypediscovery.TypeKindUint: func(name string) string {
		return fmt.Sprintf("reflect.TypeOf(%s(0))", name)
	},
}

func renderReflectExpr(entry registryEntry, importAliases map[string]string) string {
	qualifiedName := entry.Type.Name
	if qualifier := importAliases[entry.PkgPath]; qualifier != "" {
		qualifiedName = qualifier + "." + entry.Type.Name
	}
	builder, ok := reflectExprBuilders[entry.Type.Kind]
	if ok {
		return builder(qualifiedName)
	}
	fail("unsupported discovered type kind %q for %s", entry.Type.Kind, entry.Type.Name)
	return ""
}

func renderTargetReflectExpr(entry registryEntry, importAliases map[string]string) string {
	qualifiedName := entry.Type.TargetTypeName
	if qualifier := importAliases[entry.Type.TargetPackagePath]; qualifier != "" {
		qualifiedName = qualifier + "." + entry.Type.TargetTypeName
	}
	return fmt.Sprintf("reflect.TypeOf((*%s)(nil)).Elem()", qualifiedName)
}

func buildImportAliases(target registryTarget, entries []registryEntry) map[string]string {
	aliases := map[string]string{}
	used := map[string]struct{}{
		target.Package: {},
	}
	for _, importPath := range externalImportPaths(target, entries) {
		if importPath == packagePathForPackageName(target.Package) {
			continue
		}
		base := strings.TrimSpace(path.Base(importPath))
		alias := sanitizeAlias(base)
		if alias == "" {
			alias = "pkg"
		}
		candidate := alias
		suffix := 2
		for {
			if _, exists := used[candidate]; !exists {
				break
			}
			candidate = fmt.Sprintf("%s%d", alias, suffix)
			suffix++
		}
		used[candidate] = struct{}{}
		aliases[importPath] = candidate
	}
	return aliases
}

func externalImportPaths(target registryTarget, entries []registryEntry) []string {
	targetPkgPath := packagePathForPackageName(target.Package)
	imports := []string{}
	seen := map[string]struct{}{}
	for _, entry := range entries {
		if entry.PkgPath == targetPkgPath {
			continue
		}
		if _, ok := seen[entry.PkgPath]; ok {
			continue
		}
		seen[entry.PkgPath] = struct{}{}
		imports = append(imports, entry.PkgPath)
	}
	if target.TypeOverrideFunc != "" {
		for _, entry := range buildTypeOverrideEntries(target, entries) {
			if entry.Type.TargetPackagePath == targetPkgPath {
				continue
			}
			if _, ok := seen[entry.Type.TargetPackagePath]; ok {
				continue
			}
			seen[entry.Type.TargetPackagePath] = struct{}{}
			imports = append(imports, entry.Type.TargetPackagePath)
		}
	}
	sort.Strings(imports)
	return imports
}

func sanitizeAlias(value string) string {
	return strings.ReplaceAll(value, "-", "_")
}

func targetKey(discoveredType gotypediscovery.DiscoveredType) string {
	if strings.TrimSpace(discoveredType.TargetPackagePath) == "" ||
		strings.TrimSpace(discoveredType.TargetTypeName) == "" {
		return ""
	}
	return discoveredType.TargetPackagePath + "::" + discoveredType.TargetTypeName
}

func buildTypeOverrideEntries(target registryTarget, entries []registryEntry) []registryEntry {
	targetPkgPath := packagePathForPackageName(target.Package)
	overrideEntries := make([]registryEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.PkgPath != targetPkgPath ||
			strings.TrimSpace(entry.Type.TargetPackagePath) == "" ||
			strings.TrimSpace(entry.Type.TargetTypeName) == "" {
			continue
		}
		overrideEntries = append(overrideEntries, entry)
	}
	return overrideEntries
}

func packagePathForPackageName(packageName string) string {
	return "setta/internal/" + packageName
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "setta-gen-go-type-registries: "+format+"\n", args...)
	os.Exit(1)
}
