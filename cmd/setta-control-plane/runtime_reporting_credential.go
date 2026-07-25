package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"setta/internal/controlplane"
)

func runGenerateRuntimeReportingCredential(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) int {
	var outputPath string
	flagSet := flag.NewFlagSet(
		"setta-control-plane generate-runtime-reporting-credential",
		flag.ContinueOnError,
	)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&outputPath, "output", "", "new private runtime reporting credential file")
	if err := flagSet.Parse(args); err != nil {
		return 2
	}
	if flagSet.NArg() != 0 || outputPath == "" || !filepath.IsAbs(outputPath) {
		fmt.Fprintln(stderr, "runtime reporting credential output must be an absolute path")
		return 2
	}
	credential, err := controlplane.NewRuntimeReportingCredential()
	if err != nil {
		fmt.Fprintln(stderr, "generate runtime reporting credential failed")
		return 1
	}
	if err := writeNewPrivateRuntimeReportingCredential(outputPath, credential); err != nil {
		fmt.Fprintln(stderr, "write runtime reporting credential failed")
		return 1
	}
	if err := json.NewEncoder(stdout).Encode(controlplane.AdminEvent{
		Event:  "runtime_reporting_credential_generated",
		Status: "created",
	}); err != nil {
		fmt.Fprintln(stderr, "write runtime reporting credential event failed")
		return 1
	}
	return 0
}

func writeNewPrivateRuntimeReportingCredential(
	outputPath string,
	credential controlplane.RuntimeReportingCredential,
) error {
	if err := controlplane.ValidateRuntimeReportingCredential(credential); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return errors.New("runtime reporting credential output already exists")
		}
		return err
	}
	if err := json.NewEncoder(file).Encode(credential); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}
