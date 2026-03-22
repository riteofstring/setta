package gotypediscovery

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
)

const (
	modulePath    = "setta"
	skipDirective = "setta-go-type-discovery: skip"
)

type TypeKind string

const (
	TypeKindArray     TypeKind = "array"
	TypeKindBool      TypeKind = "bool"
	TypeKindFloat     TypeKind = "float"
	TypeKindInterface TypeKind = "interface"
	TypeKindInt       TypeKind = "int"
	TypeKindMap       TypeKind = "map"
	TypeKindNamed     TypeKind = "named"
	TypeKindSlice     TypeKind = "slice"
	TypeKindString    TypeKind = "string"
	TypeKindStruct    TypeKind = "struct"
	TypeKindUint      TypeKind = "uint"
)

type DiscoveredType struct {
	Name              string
	Kind              TypeKind
	IsAlias           bool
	TargetPackagePath string
	TargetTypeName    string
}

type DiscoverOptions struct {
	RequireJSONTaggedStructs bool
	IncludeZeroFieldStructs  bool
	IncludeInterfaces        bool
	IncludeCollectionAliases bool
	IncludeNonStringScalars  bool
}

func DiscoverPackageTypes(pkgPath string) ([]DiscoveredType, error) {
	dir, err := packageDir(pkgPath)
	if err != nil {
		return nil, err
	}
	return DiscoverPackageTypesInDir(dir)
}

func DiscoverPackageTypesWithOptions(
	pkgPath string,
	options DiscoverOptions,
) ([]DiscoveredType, error) {
	dir, err := packageDir(pkgPath)
	if err != nil {
		return nil, err
	}
	return DiscoverPackageTypesInDirWithOptions(dir, options)
}

func DiscoverPackageTypesInDir(dir string) ([]DiscoveredType, error) {
	return DiscoverPackageTypesInDirWithOptions(
		dir,
		DiscoverOptions{
			IncludeZeroFieldStructs:  true,
			IncludeInterfaces:        true,
			IncludeCollectionAliases: true,
			IncludeNonStringScalars:  true,
		},
	)
}

func DiscoverPackageTypesInDirWithOptions(
	dir string,
	options DiscoverOptions,
) ([]DiscoveredType, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil {
		return nil, fmt.Errorf("glob %s: %w", dir, err)
	}
	slices.Sort(matches)

	discovered := make([]DiscoveredType, 0, len(matches))
	fileSet := token.NewFileSet()
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fileSet, match, nil, parser.ParseComments)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", match, err)
		}
		importPaths := importAliasPaths(file)
		for _, decl := range file.Decls {
			genDecl, ok := decl.(*ast.GenDecl)
			if !ok || genDecl.Tok != token.TYPE {
				continue
			}
			for _, spec := range genDecl.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok ||
					!typeSpec.Name.IsExported() ||
					typeSpec.TypeParams != nil {
					continue
				}
				if shouldSkipType(genDecl, typeSpec) {
					continue
				}
				kind, ok := classifyType(typeSpec.Type, options)
				if !ok {
					continue
				}
				entry := DiscoveredType{
					Name:    typeSpec.Name.Name,
					Kind:    kind,
					IsAlias: typeSpec.Assign.IsValid(),
				}
				if targetPackagePath, targetTypeName, ok := selectorTarget(typeSpec.Type, importPaths); ok {
					entry.TargetPackagePath = targetPackagePath
					entry.TargetTypeName = targetTypeName
				}
				discovered = append(discovered, entry)
			}
		}
	}
	return discovered, nil
}

func importAliasPaths(file *ast.File) map[string]string {
	paths := map[string]string{}
	if file == nil {
		return paths
	}
	for _, spec := range file.Imports {
		if spec == nil || spec.Path == nil {
			continue
		}
		importPath := strings.Trim(strings.TrimSpace(spec.Path.Value), `"`)
		if importPath == "" {
			continue
		}
		alias := pathAlias(spec, importPath)
		if alias == "" {
			continue
		}
		paths[alias] = importPath
	}
	return paths
}

func pathAlias(spec *ast.ImportSpec, importPath string) string {
	if spec != nil && spec.Name != nil {
		name := strings.TrimSpace(spec.Name.Name)
		if name == "." || name == "_" {
			return ""
		}
		if name != "" {
			return name
		}
	}
	base := filepath.Base(importPath)
	if base == "." || base == "/" {
		return ""
	}
	return base
}

func selectorTarget(expr ast.Expr, importPaths map[string]string) (string, string, bool) {
	selector, ok := expr.(*ast.SelectorExpr)
	if !ok {
		return "", "", false
	}
	packageIdent, ok := selector.X.(*ast.Ident)
	if !ok || packageIdent == nil {
		return "", "", false
	}
	importPath, ok := importPaths[packageIdent.Name]
	if !ok || strings.TrimSpace(selector.Sel.Name) == "" {
		return "", "", false
	}
	return importPath, selector.Sel.Name, true
}

func shouldSkipType(genDecl *ast.GenDecl, typeSpec *ast.TypeSpec) bool {
	return hasSkipDirective(typeSpec.Doc) ||
		hasSkipDirective(typeSpec.Comment) ||
		hasSkipDirective(genDecl.Doc)
}

func hasSkipDirective(commentGroup *ast.CommentGroup) bool {
	if commentGroup == nil {
		return false
	}
	return strings.Contains(commentGroup.Text(), skipDirective)
}

func classifyType(expr ast.Expr, options DiscoverOptions) (TypeKind, bool) {
	switch typed := expr.(type) {
	case *ast.StructType:
		if !structMatchesOptions(typed, options) {
			return "", false
		}
		return TypeKindStruct, true
	case *ast.InterfaceType:
		if !options.IncludeInterfaces {
			return "", false
		}
		return TypeKindInterface, true
	case *ast.ArrayType:
		if !options.IncludeCollectionAliases {
			return "", false
		}
		if typed.Len == nil {
			return TypeKindSlice, true
		}
		return TypeKindArray, true
	case *ast.MapType:
		if !options.IncludeCollectionAliases {
			return "", false
		}
		return TypeKindMap, true
	case *ast.SelectorExpr:
		return TypeKindNamed, true
	case *ast.Ident:
		switch typed.Name {
		case "string":
			return TypeKindString, true
		case "bool":
			if !options.IncludeNonStringScalars {
				return "", false
			}
			return TypeKindBool, true
		case "int", "int8", "int16", "int32", "int64":
			if !options.IncludeNonStringScalars {
				return "", false
			}
			return TypeKindInt, true
		case "uint", "uint8", "uint16", "uint32", "uint64":
			if !options.IncludeNonStringScalars {
				return "", false
			}
			return TypeKindUint, true
		case "float32", "float64":
			if !options.IncludeNonStringScalars {
				return "", false
			}
			return TypeKindFloat, true
		}
		return "", false
	default:
		return "", false
	}
}

func structMatchesOptions(typed *ast.StructType, options DiscoverOptions) bool {
	if typed == nil || typed.Fields == nil || len(typed.Fields.List) == 0 {
		return options.IncludeZeroFieldStructs
	}
	if !options.RequireJSONTaggedStructs {
		return true
	}
	for _, field := range typed.Fields.List {
		if !fieldHasExportedName(field) {
			continue
		}
		if hasSupportedJSONTag(field) {
			return true
		}
	}
	return false
}

func fieldHasExportedName(field *ast.Field) bool {
	if field == nil || len(field.Names) == 0 {
		return false
	}
	for _, name := range field.Names {
		if name != nil && name.IsExported() {
			return true
		}
	}
	return false
}

func hasSupportedJSONTag(field *ast.Field) bool {
	if field == nil || field.Tag == nil {
		return false
	}
	tagValue := strings.Trim(field.Tag.Value, "`")
	if tagValue == "" {
		return false
	}
	jsonTag := reflect.StructTag(tagValue).Get("json")
	if jsonTag == "" || jsonTag == "-" {
		return false
	}
	name := strings.TrimSpace(strings.Split(jsonTag, ",")[0])
	return name != ""
}

func packageDir(pkgPath string) (string, error) {
	repoRoot, err := repoRoot()
	if err != nil {
		return "", err
	}
	if pkgPath == modulePath {
		return repoRoot, nil
	}
	prefix := modulePath + "/"
	if !strings.HasPrefix(pkgPath, prefix) {
		return "", fmt.Errorf("unsupported package path %q", pkgPath)
	}
	return filepath.Join(repoRoot, filepath.FromSlash(strings.TrimPrefix(pkgPath, prefix))), nil
}

func repoRoot() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve caller path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", "..")), nil
}
