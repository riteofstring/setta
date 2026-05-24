package main

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"setta/internal/gotypediscovery"
)

func writeSharedDefaultProviderRegistry(
	frontendEntries []registryEntry,
	write bool,
) error {
	if len(frontendEntries) == 0 {
		return fmt.Errorf("missing frontend registry entries")
	}
	providersByProfile := map[string][]defaultProviderEntry{}
	for _, profile := range sharedDefaultProviderProfiles {
		providers, err := discoverDefaultProviderEntries(frontendEntries, profile.FunctionPrefix)
		if err != nil {
			return err
		}
		if len(providers) == 0 {
			continue
		}
		providersByProfile[profile.Name] = providers
	}
	contents := renderSharedDefaultProviderRegistry(providersByProfile)
	if !write {
		fmt.Printf("== %s ==\n%s\n", sharedDefaultProviderOutputPath, contents)
		return nil
	}
	return os.WriteFile(sharedDefaultProviderOutputPath, []byte(contents), 0o644)
}

func discoverDefaultProviderEntries(
	frontendEntries []registryEntry,
	functionPrefix string,
) ([]defaultProviderEntry, error) {
	indexes, err := normalizedFrontendTypeIndex(frontendEntries)
	if err != nil {
		return nil, err
	}

	providersByTarget := map[string]defaultProviderEntry{}
	for _, pkgPath := range frontendDefaultProviderSourcePackages(frontendEntries) {
		if err := discoverPackageDefaultProviderEntries(providersByTarget, indexes, pkgPath, functionPrefix); err != nil {
			return nil, err
		}
	}
	return sortedDefaultProviderEntries(providersByTarget), nil
}

func discoverPackageDefaultProviderEntries(
	providersByTarget map[string]defaultProviderEntry,
	indexes frontendTypeIndexes,
	pkgPath string,
	functionPrefix string,
) error {
	functions, err := gotypediscovery.DiscoverPackageZeroArgFunctionsWithPrefix(
		pkgPath,
		functionPrefix,
	)
	if err != nil {
		return fmt.Errorf("discover default providers in %s: %w", pkgPath, err)
	}
	for _, function := range functions {
		entry, ok := buildDefaultProviderEntry(indexes, pkgPath, functionPrefix, function.Name)
		if !ok {
			continue
		}
		if err := recordDefaultProviderEntry(providersByTarget, entry); err != nil {
			return err
		}
	}
	return nil
}

func buildDefaultProviderEntry(
	indexes frontendTypeIndexes,
	pkgPath string,
	functionPrefix string,
	functionName string,
) (defaultProviderEntry, bool) {
	target, ok := resolveDefaultProviderTarget(
		indexes,
		pkgPath,
		strings.TrimPrefix(functionName, functionPrefix),
	)
	if !ok {
		return defaultProviderEntry{}, false
	}
	if _, skipped := skippedFrontendDefaultProviderTypes[target.Type.Name]; skipped {
		return defaultProviderEntry{}, false
	}
	return defaultProviderEntry{
		Target:              target,
		ProviderPackagePath: pkgPath,
		ProviderFuncName:    functionName,
	}, true
}

func resolveDefaultProviderTarget(
	indexes frontendTypeIndexes,
	pkgPath string,
	suffix string,
) (registryEntry, bool) {
	key := normalizedRegistryName(suffix)
	target, ok := selectFrontendLocalType(indexes.LocalNames[key], pkgPath)
	if ok {
		return target, true
	}
	targetsByPackage := indexes.TargetNames[pkgPath]
	target, ok = targetsByPackage[key]
	return target, ok
}

func recordDefaultProviderEntry(
	providersByTarget map[string]defaultProviderEntry,
	entry defaultProviderEntry,
) error {
	existing, ok := providersByTarget[entry.Target.Type.Name]
	if ok &&
		(existing.ProviderPackagePath != entry.ProviderPackagePath ||
			existing.ProviderFuncName != entry.ProviderFuncName) {
		return fmt.Errorf(
			"multiple default providers discovered for %s: %s.%s and %s.%s",
			entry.Target.Type.Name,
			existing.ProviderPackagePath,
			existing.ProviderFuncName,
			entry.ProviderPackagePath,
			entry.ProviderFuncName,
		)
	}
	providersByTarget[entry.Target.Type.Name] = entry
	return nil
}

func sortedDefaultProviderEntries(
	providersByTarget map[string]defaultProviderEntry,
) []defaultProviderEntry {
	providers := make([]defaultProviderEntry, 0, len(providersByTarget))
	for _, entry := range providersByTarget {
		providers = append(providers, entry)
	}
	sort.Slice(providers, func(i, j int) bool {
		return providers[i].Target.Type.Name < providers[j].Target.Type.Name
	})
	return providers
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
	if preferred, resolved := preferNormalizedRegistryEntry(existing, entry); resolved {
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
		if next, ok := preferNormalizedRegistryEntry(preferred, candidate); ok {
			preferred = next
			resolved = true
			continue
		}
		return registryEntry{}, false
	}
	return preferred, resolved
}

func frontendDefaultProviderSourcePackages(frontendEntries []registryEntry) []string {
	packages := []string{}
	seen := map[string]struct{}{}
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

func renderSharedDefaultProviderRegistry(
	entriesByProfile map[string][]defaultProviderEntry,
) string {
	var builder strings.Builder
	builder.WriteString("// Code generated by ./scripts/go.sh run ./cmd/setta-gen-go-type-registries; DO NOT EDIT.\n\n")
	builder.WriteString("package sharedtypes\n\n")

	importPaths := sharedDefaultProviderImportPaths(entriesByProfile)
	if len(importPaths) == 0 {
		builder.WriteString("import \"reflect\"\n\n")
	} else {
		builder.WriteString("import (\n")
		builder.WriteString("\t\"reflect\"\n")
		importAliases := buildImportAliasesForPaths("sharedtypes", importPaths)
		for _, importPath := range importPaths {
			builder.WriteString("\t")
			builder.WriteString(importAliases[importPath])
			builder.WriteString(" ")
			builder.WriteString(fmt.Sprintf("%q", importPath))
			builder.WriteString("\n")
		}
		builder.WriteString(")\n\n")
	}

	builder.WriteString("func discoveredSharedDefaultValueProvidersByProfile() map[string]map[reflect.Type]func() any {\n")
	builder.WriteString("\treturn map[string]map[reflect.Type]func() any{\n")
	importAliases := buildImportAliasesForPaths("sharedtypes", importPaths)
	for _, profile := range orderedDefaultProviderProfiles(entriesByProfile) {
		builder.WriteString("\t\t")
		builder.WriteString(fmt.Sprintf("%q", profile))
		builder.WriteString(": {\n")
		for _, entry := range entriesByProfile[profile] {
			builder.WriteString("\t\t\t")
			builder.WriteString(renderReflectExpr(entry.Target, importAliases))
			builder.WriteString(": func() any {\n")
			builder.WriteString("\t\t\t\treturn ")
			builder.WriteString(renderDefaultProviderCall(entry, importAliases))
			builder.WriteString("\n")
			builder.WriteString("\t\t\t},\n")
		}
		builder.WriteString("\t\t},\n")
	}
	builder.WriteString("\t}\n")
	builder.WriteString("}\n")
	return builder.String()
}

func sharedDefaultProviderImportPaths(
	entriesByProfile map[string][]defaultProviderEntry,
) []string {
	imports := []string{}
	seen := map[string]struct{}{}
	for _, profile := range orderedDefaultProviderProfiles(entriesByProfile) {
		for _, entry := range entriesByProfile[profile] {
			for _, importPath := range []string{entry.ProviderPackagePath, entry.Target.PkgPath} {
				if importPath == "setta/internal/sharedtypes" || strings.TrimSpace(importPath) == "" {
					continue
				}
				if _, ok := seen[importPath]; ok {
					continue
				}
				seen[importPath] = struct{}{}
				imports = append(imports, importPath)
			}
		}
	}
	sort.Strings(imports)
	return imports
}

func orderedDefaultProviderProfiles(
	entriesByProfile map[string][]defaultProviderEntry,
) []string {
	profiles := make([]string, 0, len(entriesByProfile))
	for profile := range entriesByProfile {
		profiles = append(profiles, profile)
	}
	sort.Strings(profiles)
	return profiles
}
