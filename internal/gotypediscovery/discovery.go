package gotypediscovery

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
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
	TypeKindSlice     TypeKind = "slice"
	TypeKindString    TypeKind = "string"
	TypeKindStruct    TypeKind = "struct"
	TypeKindUint      TypeKind = "uint"
)

type DiscoveredType struct {
	Name string
	Kind TypeKind
}

func DiscoverPackageTypes(pkgPath string) ([]DiscoveredType, error) {
	dir, err := packageDir(pkgPath)
	if err != nil {
		return nil, err
	}
	return DiscoverPackageTypesInDir(dir)
}

func DiscoverPackageTypesInDir(dir string) ([]DiscoveredType, error) {
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
		for _, decl := range file.Decls {
			genDecl, ok := decl.(*ast.GenDecl)
			if !ok || genDecl.Tok != token.TYPE {
				continue
			}
			for _, spec := range genDecl.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok || typeSpec.Assign != 0 || !typeSpec.Name.IsExported() {
					continue
				}
				if shouldSkipType(genDecl, typeSpec) {
					continue
				}
				kind, ok := classifyType(typeSpec.Type)
				if !ok {
					continue
				}
				discovered = append(discovered, DiscoveredType{
					Name: typeSpec.Name.Name,
					Kind: kind,
				})
			}
		}
	}
	return discovered, nil
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

func classifyType(expr ast.Expr) (TypeKind, bool) {
	switch typed := expr.(type) {
	case *ast.StructType:
		return TypeKindStruct, true
	case *ast.InterfaceType:
		return TypeKindInterface, true
	case *ast.ArrayType:
		if typed.Len == nil {
			return TypeKindSlice, true
		}
		return TypeKindArray, true
	case *ast.MapType:
		return TypeKindMap, true
	case *ast.Ident:
		switch typed.Name {
		case "string":
			return TypeKindString, true
		case "bool":
			return TypeKindBool, true
		case "int", "int8", "int16", "int32", "int64":
			return TypeKindInt, true
		case "uint", "uint8", "uint16", "uint32", "uint64":
			return TypeKindUint, true
		case "float32", "float64":
			return TypeKindFloat, true
		}
		return "", false
	default:
		return "", false
	}
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
