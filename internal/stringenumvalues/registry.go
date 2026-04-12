package stringenumvalues

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
	"sync"
	"unicode"
)

const modulePath = "setta"

type EnumValue struct {
	Name  string
	Value string
}

type Registry struct {
	mu       sync.Mutex
	packages map[string]*packageData
}

type packageData struct {
	constEntries     map[string]*constEntry
	constDeclaration []*constEntry
	namedTypes       map[string]*typeEntry
	enumValuesByType map[string][]EnumValue
}

type typeEntry struct {
	expr      ast.Expr
	imports   map[string]string
	resolved  bool
	resolving bool
	isString  bool
}

type constEntry struct {
	name     string
	typeName string
	expr     ast.Expr
	imports  map[string]string

	resolved  bool
	resolving bool
	value     string
	hasValue  bool
}

var (
	defaultRegistryOnce sync.Once
	defaultRegistry     *Registry
)

func Default() *Registry {
	defaultRegistryOnce.Do(func() {
		defaultRegistry = New()
	})
	return defaultRegistry
}

func New() *Registry {
	return &Registry{
		packages: make(map[string]*packageData),
	}
}

func (r *Registry) Values(t reflect.Type) ([]EnumValue, bool, error) {
	if t == nil {
		return nil, false, nil
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t.Kind() != reflect.String || t.Name() == "" || t.PkgPath() == "" {
		return nil, false, nil
	}

	pkg, err := r.loadPackage(t.PkgPath())
	if err != nil {
		return nil, false, err
	}
	values, ok := pkg.enumValuesByType[t.Name()]
	if !ok || len(values) == 0 {
		return nil, false, nil
	}
	return slices.Clone(values), true, nil
}

func (r *Registry) ValuesByTypeName(
	pkgPaths []string,
	typeName string,
) ([]EnumValue, bool, error) {
	for _, pkgPath := range pkgPaths {
		pkg, err := r.loadPackage(pkgPath)
		if err != nil {
			return nil, false, err
		}
		values, ok := pkg.enumValuesByType[typeName]
		if !ok || len(values) == 0 {
			continue
		}
		return slices.Clone(values), true, nil
	}
	return nil, false, nil
}

func (r *Registry) loadPackage(pkgPath string) (*packageData, error) {
	r.mu.Lock()
	if cached, ok := r.packages[pkgPath]; ok {
		r.mu.Unlock()
		return cached, nil
	}
	r.mu.Unlock()

	loaded, err := r.parsePackage(pkgPath)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if cached, ok := r.packages[pkgPath]; ok {
		return cached, nil
	}
	r.packages[pkgPath] = loaded
	return loaded, nil
}

func (r *Registry) parsePackage(pkgPath string) (*packageData, error) {
	packageDir, err := packageDir(pkgPath)
	if err != nil {
		return nil, err
	}

	matches, err := packageSourceFiles(packageDir)
	if err != nil {
		return nil, fmt.Errorf("glob package files for %s: %w", pkgPath, err)
	}

	data := newPackageData()
	if err := collectPackageSourceDeclarations(matches, data); err != nil {
		return nil, err
	}
	if err := r.collectPackageConstEnumValues(pkgPath, data); err != nil {
		return nil, err
	}
	if err := r.preResolvePackageNamedTypes(pkgPath, data); err != nil {
		return nil, err
	}
	return data, nil
}

func newPackageData() *packageData {
	return &packageData{
		constEntries:     make(map[string]*constEntry),
		constDeclaration: make([]*constEntry, 0),
		namedTypes:       make(map[string]*typeEntry),
		enumValuesByType: make(map[string][]EnumValue),
	}
}

func packageSourceFiles(packageDir string) ([]string, error) {
	matches, err := filepath.Glob(filepath.Join(packageDir, "*.go"))
	if err != nil {
		return nil, err
	}
	slices.Sort(matches)
	filtered := matches[:0]
	for _, match := range matches {
		if strings.HasSuffix(match, "_test.go") {
			continue
		}
		filtered = append(filtered, match)
	}
	return filtered, nil
}

func collectPackageSourceDeclarations(matches []string, data *packageData) error {
	fileSet := token.NewFileSet()
	for _, match := range matches {
		if err := collectPackageSourceFileDeclarations(fileSet, data, match); err != nil {
			return err
		}
	}
	return nil
}

func collectPackageSourceFileDeclarations(
	fileSet *token.FileSet,
	data *packageData,
	path string,
) error {
	file, err := parser.ParseFile(fileSet, path, nil, 0)
	if err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	imports := fileImportPaths(file)
	for _, decl := range file.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok {
			continue
		}
		collectPackageGenDecl(data, genDecl, imports)
	}
	return nil
}

func collectPackageGenDecl(
	data *packageData,
	genDecl *ast.GenDecl,
	imports map[string]string,
) {
	switch genDecl.Tok {
	case token.TYPE:
		collectNamedTypes(data.namedTypes, genDecl, imports)
	case token.CONST:
		collectConstEntries(data, genDecl, imports)
	}
}

func (r *Registry) collectPackageConstEnumValues(
	pkgPath string,
	data *packageData,
) error {
	for _, entry := range data.constDeclaration {
		value, ok, err := r.enumValueForConstEntry(pkgPath, data, entry)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		data.enumValuesByType[entry.typeName] = append(
			data.enumValuesByType[entry.typeName],
			value,
		)
	}
	return nil
}

func (r *Registry) enumValueForConstEntry(
	pkgPath string,
	data *packageData,
	entry *constEntry,
) (EnumValue, bool, error) {
	isStringType, err := r.isNamedStringType(pkgPath, data, entry.typeName)
	if err != nil {
		return EnumValue{}, false, err
	}
	if !isStringType {
		return EnumValue{}, false, nil
	}
	value, ok, err := r.resolveConstValue(pkgPath, data, entry)
	if err != nil {
		return EnumValue{}, false, err
	}
	if !ok {
		return EnumValue{}, false, nil
	}
	return EnumValue{
		Name:  deriveEnumMemberName(entry.typeName, entry.name, value),
		Value: value,
	}, true, nil
}

func (r *Registry) preResolvePackageNamedTypes(
	pkgPath string,
	data *packageData,
) error {
	for typeName := range data.namedTypes {
		if _, _, err := r.resolveEnumValuesForType(
			pkgPath,
			data,
			typeName,
			map[string]bool{},
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *Registry) resolveEnumValuesForType(
	pkgPath string,
	data *packageData,
	typeName string,
	stack map[string]bool,
) ([]EnumValue, bool, error) {
	if typeName == "" {
		return nil, false, nil
	}
	if values, ok := data.enumValuesByType[typeName]; ok && len(values) > 0 {
		return slices.Clone(values), true, nil
	}
	isStringType, err := r.isNamedStringType(pkgPath, data, typeName)
	if err != nil {
		return nil, false, err
	}
	if !isStringType {
		return nil, false, nil
	}
	entry, ok := data.namedTypes[typeName]
	if !ok {
		return nil, false, nil
	}

	stackKey := pkgPath + "." + typeName
	if stack[stackKey] {
		return nil, false, fmt.Errorf("cyclic enum evaluation for %s", stackKey)
	}
	stack[stackKey] = true
	defer delete(stack, stackKey)

	values, ok, err := r.resolveEnumValuesFromExpr(
		pkgPath,
		data,
		entry.imports,
		entry.expr,
		stack,
	)
	if err != nil {
		return nil, false, err
	}
	if !ok || len(values) == 0 {
		return nil, false, nil
	}

	data.enumValuesByType[typeName] = slices.Clone(values)
	return slices.Clone(values), true, nil
}

func (r *Registry) resolveEnumValuesFromExpr(
	pkgPath string,
	data *packageData,
	imports map[string]string,
	expr ast.Expr,
	stack map[string]bool,
) ([]EnumValue, bool, error) {
	switch typed := expr.(type) {
	case *ast.Ident:
		if typed.Name == "string" {
			return nil, false, nil
		}
		return r.resolveEnumValuesForType(pkgPath, data, typed.Name, stack)
	case *ast.SelectorExpr:
		packageIdent, ok := typed.X.(*ast.Ident)
		if !ok {
			return nil, false, nil
		}
		importPath, ok := imports[packageIdent.Name]
		if !ok {
			return nil, false, nil
		}
		importedPackage, err := r.loadPackage(importPath)
		if err != nil {
			return nil, false, err
		}
		return r.resolveEnumValuesForType(
			importPath,
			importedPackage,
			typed.Sel.Name,
			stack,
		)
	case *ast.ParenExpr:
		return r.resolveEnumValuesFromExpr(pkgPath, data, imports, typed.X, stack)
	default:
		return nil, false, nil
	}
}

func collectNamedTypes(
	target map[string]*typeEntry,
	decl *ast.GenDecl,
	imports map[string]string,
) {
	for _, spec := range decl.Specs {
		typeSpec, ok := spec.(*ast.TypeSpec)
		if !ok || typeSpec.Assign != 0 || typeSpec.TypeParams != nil {
			continue
		}
		if _, exists := target[typeSpec.Name.Name]; exists {
			continue
		}
		target[typeSpec.Name.Name] = &typeEntry{
			expr:    typeSpec.Type,
			imports: imports,
		}
	}
}

func collectConstEntries(
	data *packageData,
	decl *ast.GenDecl,
	imports map[string]string,
) {
	prevTypeName := ""
	var prevValues []ast.Expr

	for _, spec := range decl.Specs {
		valueSpec, ok := spec.(*ast.ValueSpec)
		if !ok {
			continue
		}

		currentTypeName := prevTypeName
		if valueSpec.Type != nil {
			currentTypeName = localTypeName(valueSpec.Type)
		}
		values := valueSpec.Values
		if len(values) == 0 {
			values = prevValues
		}
		if len(valueSpec.Values) > 0 {
			prevValues = valueSpec.Values
		}
		prevTypeName = currentTypeName

		for index, name := range valueSpec.Names {
			expr := pickValueExpr(values, index)
			if expr == nil {
				continue
			}
			entry := &constEntry{
				name:     name.Name,
				typeName: currentTypeName,
				expr:     expr,
				imports:  imports,
			}
			data.constEntries[entry.name] = entry
			data.constDeclaration = append(data.constDeclaration, entry)
		}
	}
}

func localTypeName(expr ast.Expr) string {
	ident, ok := expr.(*ast.Ident)
	if !ok {
		return ""
	}
	return ident.Name
}

func (r *Registry) isNamedStringType(
	pkgPath string,
	data *packageData,
	typeName string,
) (bool, error) {
	if typeName == "" {
		return false, nil
	}
	entry, ok := data.namedTypes[typeName]
	if !ok {
		return false, nil
	}
	if entry.resolved {
		return entry.isString, nil
	}
	if entry.resolving {
		return false, fmt.Errorf("cyclic type evaluation for %s.%s", pkgPath, typeName)
	}
	entry.resolving = true
	defer func() {
		entry.resolving = false
		entry.resolved = true
	}()

	isString, err := r.exprIsStringType(pkgPath, data, entry.imports, entry.expr)
	if err != nil {
		return false, err
	}
	entry.isString = isString
	return isString, nil
}

func (r *Registry) exprIsStringType(
	pkgPath string,
	data *packageData,
	imports map[string]string,
	expr ast.Expr,
) (bool, error) {
	switch typed := expr.(type) {
	case *ast.Ident:
		if typed.Name == "string" {
			return true, nil
		}
		return r.isNamedStringType(pkgPath, data, typed.Name)
	case *ast.SelectorExpr:
		packageIdent, ok := typed.X.(*ast.Ident)
		if !ok {
			return false, nil
		}
		importPath, ok := imports[packageIdent.Name]
		if !ok {
			return false, nil
		}
		importedPackage, err := r.loadPackage(importPath)
		if err != nil {
			return false, err
		}
		return r.isNamedStringType(importPath, importedPackage, typed.Sel.Name)
	case *ast.ParenExpr:
		return r.exprIsStringType(pkgPath, data, imports, typed.X)
	default:
		return false, nil
	}
}

func pickValueExpr(values []ast.Expr, index int) ast.Expr {
	if index < 0 || index >= len(values) {
		return nil
	}
	return values[index]
}

func (r *Registry) resolveConstValue(
	pkgPath string,
	data *packageData,
	entry *constEntry,
) (string, bool, error) {
	if entry.resolved {
		return entry.value, entry.hasValue, nil
	}
	if entry.resolving {
		return "", false, fmt.Errorf("cyclic const evaluation for %s.%s", pkgPath, entry.name)
	}
	entry.resolving = true
	defer func() {
		entry.resolving = false
		entry.resolved = true
	}()

	value, ok, err := r.evalStringExpr(pkgPath, data, entry.imports, entry.expr)
	if err != nil {
		return "", false, err
	}
	if !ok {
		return "", false, nil
	}
	entry.value = value
	entry.hasValue = true
	return value, true, nil
}

func (r *Registry) evalStringExpr(
	pkgPath string,
	data *packageData,
	imports map[string]string,
	expr ast.Expr,
) (string, bool, error) {
	switch typed := expr.(type) {
	case *ast.BasicLit:
		return evalBasicStringLiteral(typed)
	case *ast.Ident:
		return r.evalLocalConstReference(pkgPath, data, typed.Name)
	case *ast.SelectorExpr:
		return r.evalImportedConstReference(imports, typed)
	case *ast.CallExpr:
		return r.evalWrappedStringExpr(pkgPath, data, imports, typed)
	case *ast.ParenExpr:
		return r.evalStringExpr(pkgPath, data, imports, typed.X)
	default:
		return "", false, nil
	}
}

func evalBasicStringLiteral(literal *ast.BasicLit) (string, bool, error) {
	if literal.Kind != token.STRING {
		return "", false, nil
	}
	value, err := strconv.Unquote(literal.Value)
	if err != nil {
		return "", false, fmt.Errorf("unquote %s: %w", literal.Value, err)
	}
	return value, true, nil
}

func (r *Registry) evalLocalConstReference(
	pkgPath string,
	data *packageData,
	name string,
) (string, bool, error) {
	entry, ok := data.constEntries[name]
	if !ok {
		return "", false, nil
	}
	return r.resolveConstValue(pkgPath, data, entry)
}

func (r *Registry) evalImportedConstReference(
	imports map[string]string,
	selector *ast.SelectorExpr,
) (string, bool, error) {
	importPath, ok := importPathForSelector(imports, selector)
	if !ok {
		return "", false, nil
	}
	importedPackage, err := r.loadPackage(importPath)
	if err != nil {
		return "", false, err
	}
	entry, ok := importedPackage.constEntries[selector.Sel.Name]
	if !ok {
		return "", false, nil
	}
	return r.resolveConstValue(importPath, importedPackage, entry)
}

func importPathForSelector(
	imports map[string]string,
	selector *ast.SelectorExpr,
) (string, bool) {
	packageIdent, ok := selector.X.(*ast.Ident)
	if !ok {
		return "", false
	}
	importPath, ok := imports[packageIdent.Name]
	if !ok {
		return "", false
	}
	return importPath, true
}

func (r *Registry) evalWrappedStringExpr(
	pkgPath string,
	data *packageData,
	imports map[string]string,
	call *ast.CallExpr,
) (string, bool, error) {
	if len(call.Args) != 1 {
		return "", false, nil
	}
	return r.evalStringExpr(pkgPath, data, imports, call.Args[0])
}

func fileImportPaths(file *ast.File) map[string]string {
	result := make(map[string]string, len(file.Imports))
	for _, importSpec := range file.Imports {
		pathValue, err := strconv.Unquote(importSpec.Path.Value)
		if err != nil {
			continue
		}
		if importSpec.Name != nil {
			if importSpec.Name.Name == "_" || importSpec.Name.Name == "." {
				continue
			}
			result[importSpec.Name.Name] = pathValue
			continue
		}
		parts := strings.Split(pathValue, "/")
		if len(parts) == 0 {
			continue
		}
		result[parts[len(parts)-1]] = pathValue
	}
	return result
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

func deriveEnumMemberName(typeName string, constName string, value string) string {
	if isIdentifier(value) {
		return value
	}

	suffix := strings.TrimPrefix(constName, typeName)
	if suffix == "" {
		suffix = constName
	}
	return suffix
}

func isIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, char := range value {
		if index == 0 {
			if char != '_' && !unicode.IsLetter(char) {
				return false
			}
			continue
		}
		if char != '_' && !unicode.IsLetter(char) && !unicode.IsDigit(char) {
			return false
		}
	}
	return true
}

func isAllUpper(value string) bool {
	hasLetter := false
	for _, char := range value {
		if !unicode.IsLetter(char) {
			continue
		}
		hasLetter = true
		if !unicode.IsUpper(char) {
			return false
		}
	}
	return hasLetter
}

func toSnakeCase(value string) string {
	if value == "" {
		return ""
	}
	var builder strings.Builder
	for index, char := range value {
		if unicode.IsUpper(char) {
			if index > 0 {
				prev := rune(value[index-1])
				if unicode.IsLower(prev) || unicode.IsDigit(prev) {
					builder.WriteByte('_')
				} else if index+1 < len(value) {
					next := rune(value[index+1])
					if unicode.IsLower(next) {
						builder.WriteByte('_')
					}
				}
			}
			builder.WriteRune(unicode.ToLower(char))
			continue
		}
		builder.WriteRune(char)
	}
	return builder.String()
}
