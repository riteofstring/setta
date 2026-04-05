package frontendbindings

import (
	"fmt"
	"strings"

	"setta/internal/sharedvalueexports"
)

func discoveredValueDeclarations(converter *typeConverter) []TypeDeclaration {
	exports := sharedvalueexports.DiscoveredValueExports()
	declarations := make([]TypeDeclaration, 0, len(exports))
	for _, export := range exports {
		declaration, err := discoveredValueDeclaration(converter, export)
		if err != nil {
			panic(err)
		}
		declarations = append(declarations, declaration)
	}
	return declarations
}

func discoveredValueDeclaration(
	converter *typeConverter,
	export sharedvalueexports.ValueExport,
) (TypeDeclaration, error) {
	if strings.TrimSpace(export.Name) == "" {
		return TypeDeclaration{}, fmt.Errorf("frontend value export has empty name")
	}
	if export.Value == nil {
		return TypeDeclaration{}, fmt.Errorf("frontend value export %s has no provider", export.Name)
	}
	typeExpr, err := converter.renderTypeExpr(export.Type)
	if err != nil {
		return TypeDeclaration{}, fmt.Errorf("frontend value export %s type: %w", export.Name, err)
	}
	value := export.Value()
	return constDeclaration(
		export.Name,
		true,
		renderTSLiteralExprFromGoValue("frontend value export "+export.Name, value)+" satisfies "+typeExpr,
	), nil
}

func renderTSLiteralExprFromGoValue(context string, value any) string {
	normalized := mustTSLiteralValueFromGoValue(context, value)
	return renderTSLiteralValue(normalized, "")
}
