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
	files, localTypes, err := parsePackageTypes(dir)
	if err != nil {
		return nil, err
	}
	return discoverTypesFromFiles(files, options, localTypes), nil
}

func DiscoverPackageZeroArgFunctionsWithPrefixInDir(
	dir string,
	prefix string,
) ([]DiscoveredFunction, error) {
	files, err := parsePackageFiles(dir, parser.ParseComments)
	if err != nil {
		return nil, err
	}
	return discoverZeroArgFunctions(files, prefix), nil
}

func DiscoverPackageStringConstantsWithPrefixInDir(
	dir string,
	prefix string,
) ([]DiscoveredStringConstant, error) {
	files, err := parsePackageFiles(dir, 0)
	if err != nil {
		return nil, err
	}
	constExprs := discoverPackageConstExprs(files)
	return discoverStringConstants(dir, prefix, constExprs)
}

func parsePackageTypes(dir string) ([]*ast.File, map[string]*ast.TypeSpec, error) {
	files, err := parsePackageFiles(dir, parser.ParseComments)
	if err != nil {
		return nil, nil, err
	}
	localTypes := map[string]*ast.TypeSpec{}
	for _, file := range files {
		collectLocalTypes(file, localTypes)
	}
	return files, localTypes, nil
}

func parsePackageFiles(dir string, mode parser.Mode) ([]*ast.File, error) {
	matches, err := packageGoFiles(dir)
	if err != nil {
		return nil, err
	}
	fileSet := token.NewFileSet()
	files := make([]*ast.File, 0, len(matches))
	for _, match := range matches {
		file, err := parser.ParseFile(fileSet, match, nil, mode)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", match, err)
		}
		files = append(files, file)
	}
	return files, nil
}

func packageGoFiles(dir string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil {
		return nil, fmt.Errorf("glob %s: %w", dir, err)
	}
	slices.Sort(matches)
	filtered := make([]string, 0, len(matches))
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		filtered = append(filtered, match)
	}
	return filtered, nil
}

func collectLocalTypes(file *ast.File, localTypes map[string]*ast.TypeSpec) {
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

func discoverTypesFromFiles(
	files []*ast.File,
	options DiscoverOptions,
	localTypes map[string]*ast.TypeSpec,
) []DiscoveredType {
	discovered := make([]DiscoveredType, 0, len(files))
	for _, file := range files {
		discovered = append(discovered, discoverFileTypes(file, options, localTypes)...)
	}
	return discovered
}

func discoverFileTypes(
	file *ast.File,
	options DiscoverOptions,
	localTypes map[string]*ast.TypeSpec,
) []DiscoveredType {
	importPaths := importAliasPaths(file)
	discovered := []DiscoveredType{}
	for _, decl := range file.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.TYPE {
			continue
		}
		for _, spec := range genDecl.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			entry, ok := discoveredTypeEntry(typeSpec, genDecl, options, importPaths, localTypes)
			if ok {
				discovered = append(discovered, entry)
			}
		}
	}
	return discovered
}

func discoveredTypeEntry(
	typeSpec *ast.TypeSpec,
	genDecl *ast.GenDecl,
	options DiscoverOptions,
	importPaths map[string]string,
	localTypes map[string]*ast.TypeSpec,
) (DiscoveredType, bool) {
	if typeSpec == nil ||
		typeSpec.Name == nil ||
		!typeSpec.Name.IsExported() ||
		typeSpec.TypeParams != nil ||
		shouldSkipType(genDecl, typeSpec) {
		return DiscoveredType{}, false
	}
	kind, ok := classifyType(typeSpec.Type, options, localTypes, map[string]bool{})
	if !ok {
		return DiscoveredType{}, false
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
	return entry, true
}

func discoverZeroArgFunctions(files []*ast.File, prefix string) []DiscoveredFunction {
	discovered := make([]DiscoveredFunction, 0, len(files))
	for _, file := range files {
		discovered = append(discovered, discoverFileZeroArgFunctions(file, prefix)...)
	}
	return discovered
}

func discoverFileZeroArgFunctions(file *ast.File, prefix string) []DiscoveredFunction {
	discovered := []DiscoveredFunction{}
	for _, decl := range file.Decls {
		funcDecl, ok := decl.(*ast.FuncDecl)
		if !ok {
			continue
		}
		name, ok := zeroArgFunctionName(funcDecl, prefix)
		if ok {
			discovered = append(discovered, DiscoveredFunction{Name: name})
		}
	}
	return discovered
}

func zeroArgFunctionName(funcDecl *ast.FuncDecl, prefix string) (string, bool) {
	if !isNamedTopLevelFunction(funcDecl) {
		return "", false
	}
	if !matchesDiscoveredFunctionPrefix(funcDecl, prefix) {
		return "", false
	}
	if !isZeroArgSingleUnnamedResult(funcDecl.Type) {
		return "", false
	}
	return funcDecl.Name.Name, true
}

func isNamedTopLevelFunction(funcDecl *ast.FuncDecl) bool {
	return funcDecl != nil && funcDecl.Recv == nil && funcDecl.Type != nil && funcDecl.Name != nil
}

func matchesDiscoveredFunctionPrefix(funcDecl *ast.FuncDecl, prefix string) bool {
	return funcDecl.Name.IsExported() &&
		strings.HasPrefix(funcDecl.Name.Name, prefix) &&
		!shouldSkipFunc(funcDecl)
}

func isZeroArgSingleUnnamedResult(funcType *ast.FuncType) bool {
	if funcType == nil || funcType.TypeParams != nil {
		return false
	}
	if funcType.Params == nil || len(funcType.Params.List) != 0 {
		return false
	}
	if funcType.Results == nil || len(funcType.Results.List) != 1 {
		return false
	}
	return len(funcType.Results.List[0].Names) == 0
}

func discoverPackageConstExprs(files []*ast.File) map[string]ast.Expr {
	constExprs := map[string]ast.Expr{}
	for _, file := range files {
		collectFileConstExprs(file, constExprs)
	}
	return constExprs
}

func collectFileConstExprs(file *ast.File, constExprs map[string]ast.Expr) {
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
				if ok {
					constExprs[name.Name] = expr
				}
			}
		}
	}
}

func discoverStringConstants(
	dir string,
	prefix string,
	constExprs map[string]ast.Expr,
) ([]DiscoveredStringConstant, error) {
	cache := map[string]string{}
	resolving := map[string]bool{}
	names := prefixedSortedNames(constExprs, prefix)
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

func prefixedSortedNames(constExprs map[string]ast.Expr, prefix string) []string {
	names := []string{}
	for name := range constExprs {
		if strings.HasPrefix(name, prefix) {
			names = append(names, name)
		}
	}
	slices.Sort(names)
	return names
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
	if kind, ok := classifyDirectType(expr, options); ok {
		return kind, true
	}
	ident, ok := expr.(*ast.Ident)
	if !ok {
		return "", false
	}
	if kind, ok := classifyBuiltinIdentType(ident.Name, options); ok {
		return kind, true
	}
	return classifyLocalNamedType(ident.Name, options, localTypes, resolving)
}

func classifyDirectType(expr ast.Expr, options DiscoverOptions) (TypeKind, bool) {
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
	default:
		return "", false
	}
}

func classifyBuiltinIdentType(name string, options DiscoverOptions) (TypeKind, bool) {
	switch name {
	case "string":
		return TypeKindString, true
	case "bool":
		return classifyNonStringScalarType(TypeKindBool, options)
	case "int", "int8", "int16", "int32", "int64":
		return classifyNonStringScalarType(TypeKindInt, options)
	case "uint", "uint8", "uint16", "uint32", "uint64":
		return classifyNonStringScalarType(TypeKindUint, options)
	case "float32", "float64":
		return classifyNonStringScalarType(TypeKindFloat, options)
	default:
		return "", false
	}
}

func classifyNonStringScalarType(kind TypeKind, options DiscoverOptions) (TypeKind, bool) {
	if !options.IncludeNonStringScalars {
		return "", false
	}
	return kind, true
}

func classifyLocalNamedType(
	name string,
	options DiscoverOptions,
	localTypes map[string]*ast.TypeSpec,
	resolving map[string]bool,
) (TypeKind, bool) {
	typeSpec, ok := localTypes[name]
	if !ok || resolving[name] {
		return "", false
	}
	resolving[name] = true
	defer delete(resolving, name)
	return classifyType(typeSpec.Type, options, localTypes, resolving)
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
