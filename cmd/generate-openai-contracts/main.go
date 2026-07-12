package main

import (
	"flag"
	"fmt"
	"go/format"
	"os"
)

func main() {
	schemaPath := flag.String("schema", "internal/speech/openaischema/openapi.yaml", "checked-in OpenAI OpenAPI snapshot")
	supportedPath := flag.String("supported", "internal/speech/openaischema/supported_contracts.json", "Setta-supported OpenAI contract registry")
	upstreamPath := flag.String("upstream", "internal/speech/openaischema/UPSTREAM", "OpenAI schema provenance metadata")
	goOutputPath := flag.String("go-output", "internal/speech/openai_contract_gen.go", "generated Go contract constants")
	typeScriptOutputPath := flag.String("typescript-output", "desktop/src/generated/openai-realtime.ts", "generated TypeScript Realtime contract metadata")
	flag.Parse()

	model, err := loadGenerationModel(*schemaPath, *supportedPath, *upstreamPath)
	if err != nil {
		fatalf("load OpenAI contracts: %v", err)
	}
	goSource, err := renderGoContracts(model)
	if err != nil {
		fatalf("render Go OpenAI contracts: %v", err)
	}
	formattedGoSource, err := format.Source(goSource)
	if err != nil {
		fatalf("format generated Go OpenAI contracts: %v", err)
	}
	if err := writeGeneratedFile(*goOutputPath, formattedGoSource); err != nil {
		fatalf("write generated Go OpenAI contracts: %v", err)
	}
	if err := writeGeneratedFile(*typeScriptOutputPath, renderTypeScriptContracts(model)); err != nil {
		fatalf("write generated TypeScript OpenAI contracts: %v", err)
	}
}

func writeGeneratedFile(path string, content []byte) error {
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
