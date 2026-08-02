package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"setta/internal/evalharness/typescriptverifier"
	evalverifier "setta/internal/evalharness/verifier"
)

func main() {
	verifierID := flag.String("verifier", "", "checked-in scenario verifier identifier")
	baseline := flag.String("baseline", "", "read-only baseline fixture directory")
	workspace := flag.String("workspace", "", "final workspace directory")
	flag.Parse()
	if flag.NArg() != 0 {
		fatal(fmt.Errorf("unexpected positional arguments: %s", strings.Join(flag.Args(), " ")))
	}
	if strings.TrimSpace(*verifierID) == "" ||
		strings.TrimSpace(*baseline) == "" ||
		strings.TrimSpace(*workspace) == "" {
		fatal(errors.New("--verifier, --baseline, and --workspace are required"))
	}
	result, err := typescriptverifier.Verify(
		context.Background(),
		*verifierID,
		*baseline,
		*workspace,
	)
	if err != nil {
		fatal(err)
	}
	if err := evalverifier.WriteResult(os.Stdout, result); err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
