package main

import (
	"fmt"
	"path"
	"sort"
	"strings"

	"setta/internal/gotypediscovery"
)

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
	sort.Strings(imports)
	return imports
}

func sanitizeAlias(value string) string {
	return strings.ReplaceAll(value, "-", "_")
}
