package projectstate

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProjectStatePackageDoesNotDeclareLoggerSymbol(t *testing.T) {
	t.Parallel()

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read package directory: %v", err)
	}

	fset := token.NewFileSet()
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}

		file, err := parser.ParseFile(fset, filepath.Join(".", name), nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}

		for _, decl := range file.Decls {
			switch typed := decl.(type) {
			case *ast.FuncDecl:
				if typed.Recv == nil && typed.Name != nil && typed.Name.Name == "logger" {
					t.Fatalf("unexpected top-level logger function declared in %s", name)
				}
			case *ast.GenDecl:
				for _, spec := range typed.Specs {
					switch typedSpec := spec.(type) {
					case *ast.TypeSpec:
						if typedSpec.Name != nil && typedSpec.Name.Name == "logger" {
							t.Fatalf("unexpected top-level logger type declared in %s", name)
						}
					case *ast.ValueSpec:
						for _, ident := range typedSpec.Names {
							if ident != nil && ident.Name == "logger" {
								t.Fatalf("unexpected top-level logger value declared in %s", name)
							}
						}
					}
				}
			}
		}
	}
}
