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
	"strconv"
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

type DiscoveredFunction struct {
	Name string
}

type DiscoveredStringConstant struct {
	Name  string
	Value string
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

func DiscoverPackageZeroArgFunctionsWithPrefix(
	pkgPath string,
	prefix string,
) ([]DiscoveredFunction, error) {
	dir, err := packageDir(pkgPath)
	if err != nil {
		return nil, err
	}
	return DiscoverPackageZeroArgFunctionsWithPrefixInDir(dir, prefix)
}

func DiscoverPackageStringConstantsWithPrefix(
	pkgPath string,
	prefix string,
) ([]DiscoveredStringConstant, error) {
	dir, err := packageDir(pkgPath)
	if err != nil {
		return nil, err
	}
	return DiscoverPackageStringConstantsWithPrefixInDir(dir, prefix)
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
	files := make([]*ast.File, 0, len(matches))
	localTypes := map[string]*ast.TypeSpec{}
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fileSet, match, nil, parser.ParseComments)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", match, err)
		}
		files = append(files, file)
		for _, decl := range file.Decls {
			genDecl, ok := decl.(*ast.GenDecl)
			if !ok || genDecl.Tok != token.TYPE {
				continue
			}
			for _, spec := range genDecl.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok || typeSpec.Name == nil {
					continue
				}
				localTypes[typeSpec.Name.Name] = typeSpec
			}
		}
	}
	for _, file := range files {
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
				kind, ok := classifyType(typeSpec.Type, options, localTypes, map[string]bool{})
				if !ok {
					continue
				}
				entry := DiscoveredType{
					Name:    typeSpec.Name.Name,
					Kind:    kind,
					IsAlias: typeSpec.Assign.IsValid(),
				}
				if targetPackagePath, targetTypeName, ok := selectorTarget(
					typeSpec.Type,
					importPaths,
					localTypes,
					map[string]bool{},
				); ok {
					entry.TargetPackagePath = targetPackagePath
					entry.TargetTypeName = targetTypeName
				}
				discovered = append(discovered, entry)
			}
		}
	}
	return discovered, nil
}

func DiscoverPackageZeroArgFunctionsWithPrefixInDir(
	dir string,
	prefix string,
) ([]DiscoveredFunction, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil {
		return nil, fmt.Errorf("glob %s: %w", dir, err)
	}
	slices.Sort(matches)

	discovered := make([]DiscoveredFunction, 0, len(matches))
	fileSet := token.NewFileSet()
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fileSet, match, nil, parser.ParseComments)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", match, err)
		}
		for _, decl := range file.Decls {
			funcDecl, ok := decl.(*ast.FuncDecl)
			if !ok || funcDecl.Recv != nil || funcDecl.Type == nil {
				continue
			}
			if funcDecl.Name == nil ||
				!funcDecl.Name.IsExported() ||
				!strings.HasPrefix(funcDecl.Name.Name, prefix) ||
				shouldSkipFunc(funcDecl) {
				continue
			}
			if funcDecl.Type.TypeParams != nil ||
				funcDecl.Type.Params == nil ||
				len(funcDecl.Type.Params.List) != 0 ||
				funcDecl.Type.Results == nil ||
				len(funcDecl.Type.Results.List) != 1 ||
				len(funcDecl.Type.Results.List[0].Names) != 0 {
				continue
			}
			discovered = append(discovered, DiscoveredFunction{Name: funcDecl.Name.Name})
		}
	}
	return discovered, nil
}

func DiscoverPackageStringConstantsWithPrefixInDir(
	dir string,
	prefix string,
) ([]DiscoveredStringConstant, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil {
		return nil, fmt.Errorf("glob %s: %w", dir, err)
	}
	slices.Sort(matches)

	constExprs := map[string]ast.Expr{}
	fileSet := token.NewFileSet()
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fileSet, match, nil, 0)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", match, err)
		}
		for _, decl := range file.Decls {
			genDecl, ok := decl.(*ast.GenDecl)
			if !ok || genDecl.Tok != token.CONST {
				continue
			}
			for _, spec := range genDecl.Specs {
				valueSpec, ok := spec.(*ast.ValueSpec)
				if !ok {
					continue
				}
				for index, name := range valueSpec.Names {
					if name == nil || strings.TrimSpace(name.Name) == "" {
						continue
					}
					expr, ok := constValueExpr(valueSpec, index)
					if !ok {
						continue
					}
					constExprs[name.Name] = expr
				}
			}
		}
	}

	cache := map[string]string{}
	resolving := map[string]bool{}
	names := []string{}
	for name := range constExprs {
		if strings.HasPrefix(name, prefix) {
			names = append(names, name)
		}
	}
	slices.Sort(names)

	discovered := make([]DiscoveredStringConstant, 0, len(names))
	for _, name := range names {
		value, ok, err := resolveStringConstant(name, constExprs, cache, resolving)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("resolve string constant %s in %s", name, dir)
		}
		discovered = append(discovered, DiscoveredStringConstant{
			Name:  name,
			Value: value,
		})
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

func selectorTarget(
	expr ast.Expr,
	importPaths map[string]string,
	localTypes map[string]*ast.TypeSpec,
	resolving map[string]bool,
) (string, string, bool) {
	switch typed := expr.(type) {
	case *ast.SelectorExpr:
		packageIdent, ok := typed.X.(*ast.Ident)
		if !ok || packageIdent == nil {
			return "", "", false
		}
		importPath, ok := importPaths[packageIdent.Name]
		if !ok || strings.TrimSpace(typed.Sel.Name) == "" {
			return "", "", false
		}
		return importPath, typed.Sel.Name, true
	case *ast.Ident:
		typeSpec, ok := localTypes[typed.Name]
		if !ok || resolving[typed.Name] {
			return "", "", false
		}
		resolving[typed.Name] = true
		defer delete(resolving, typed.Name)
		return selectorTarget(typeSpec.Type, importPaths, localTypes, resolving)
	default:
		return "", "", false
	}
}

func shouldSkipType(genDecl *ast.GenDecl, typeSpec *ast.TypeSpec) bool {
	return hasSkipDirective(typeSpec.Doc) ||
		hasSkipDirective(typeSpec.Comment) ||
		hasSkipDirective(genDecl.Doc)
}

func shouldSkipFunc(funcDecl *ast.FuncDecl) bool {
	if funcDecl == nil {
		return false
	}
	return hasSkipDirective(funcDecl.Doc)
}

func hasSkipDirective(commentGroup *ast.CommentGroup) bool {
	if commentGroup == nil {
		return false
	}
	return strings.Contains(commentGroup.Text(), skipDirective)
}

func constValueExpr(valueSpec *ast.ValueSpec, index int) (ast.Expr, bool) {
	if valueSpec == nil {
		return nil, false
	}
	switch {
	case len(valueSpec.Values) == len(valueSpec.Names) && index < len(valueSpec.Values):
		return valueSpec.Values[index], true
	case len(valueSpec.Values) == 1:
		return valueSpec.Values[0], true
	default:
		return nil, false
	}
}

func resolveStringConstant(
	name string,
	constExprs map[string]ast.Expr,
	cache map[string]string,
	resolving map[string]bool,
) (string, bool, error) {
	if value, ok := cache[name]; ok {
		return value, true, nil
	}
	expr, ok := constExprs[name]
	if !ok {
		return "", false, nil
	}
	if resolving[name] {
		return "", false, fmt.Errorf("cyclic string constant %s", name)
	}
	resolving[name] = true
	defer delete(resolving, name)

	value, ok, err := evalStringConstExpr(expr, constExprs, cache, resolving)
	if err != nil {
		return "", false, err
	}
	if ok {
		cache[name] = value
	}
	return value, ok, nil
}

func evalStringConstExpr(
	expr ast.Expr,
	constExprs map[string]ast.Expr,
	cache map[string]string,
	resolving map[string]bool,
) (string, bool, error) {
	switch typed := expr.(type) {
	case *ast.BasicLit:
		if typed.Kind != token.STRING {
			return "", false, nil
		}
		value, err := strconv.Unquote(typed.Value)
		if err != nil {
			return "", false, fmt.Errorf("unquote %s: %w", typed.Value, err)
		}
		return value, true, nil
	case *ast.BinaryExpr:
		if typed.Op != token.ADD {
			return "", false, nil
		}
		left, ok, err := evalStringConstExpr(typed.X, constExprs, cache, resolving)
		if err != nil || !ok {
			return "", ok, err
		}
		right, ok, err := evalStringConstExpr(typed.Y, constExprs, cache, resolving)
		if err != nil || !ok {
			return "", ok, err
		}
		return left + right, true, nil
	case *ast.Ident:
		return resolveStringConstant(typed.Name, constExprs, cache, resolving)
	case *ast.ParenExpr:
		return evalStringConstExpr(typed.X, constExprs, cache, resolving)
	default:
		return "", false, nil
	}
}

func classifyType(
	expr ast.Expr,
	options DiscoverOptions,
	localTypes map[string]*ast.TypeSpec,
	resolving map[string]bool,
) (TypeKind, bool) {
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
		typeSpec, ok := localTypes[typed.Name]
		if !ok || resolving[typed.Name] {
			return "", false
		}
		resolving[typed.Name] = true
		defer delete(resolving, typed.Name)
		return classifyType(typeSpec.Type, options, localTypes, resolving)
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
	hasExportedEmbeddedField := false
	for _, field := range typed.Fields.List {
		if fieldHasEmbeddedExportedType(field) {
			hasExportedEmbeddedField = true
		}
		if !fieldHasExportedName(field) {
			continue
		}
		if hasSupportedJSONTag(field) {
			return true
		}
	}
	return hasExportedEmbeddedField
}

func fieldHasExportedName(field *ast.Field) bool {
	if field == nil {
		return false
	}
	if len(field.Names) == 0 {
		return fieldHasEmbeddedExportedType(field)
	}
	for _, name := range field.Names {
		if name != nil && name.IsExported() {
			return true
		}
	}
	return false
}

func fieldHasEmbeddedExportedType(field *ast.Field) bool {
	if field == nil || len(field.Names) != 0 {
		return false
	}
	return exprHasExportedTypeName(field.Type)
}

func exprHasExportedTypeName(expr ast.Expr) bool {
	switch typed := expr.(type) {
	case *ast.Ident:
		return typed != nil && typed.IsExported()
	case *ast.SelectorExpr:
		return typed != nil && typed.Sel != nil && ast.IsExported(typed.Sel.Name)
	case *ast.StarExpr:
		return typed != nil && exprHasExportedTypeName(typed.X)
	case *ast.IndexExpr:
		return typed != nil && exprHasExportedTypeName(typed.X)
	case *ast.IndexListExpr:
		return typed != nil && exprHasExportedTypeName(typed.X)
	default:
		return false
	}
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
