package main

import (
	"errors"
	"fmt"
	"os"

	"setta/internal/runtimeinstall"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	if len(arguments) != 8 || arguments[0] != "-Vm" || arguments[2] != "-P" ||
		arguments[4] != "-x" || arguments[6] != "-f" {
		return errors.New("usage: setta-release-verify -Vm <SHA256SUMS> -P <public-key> -x <signature> -f <release>")
	}
	return runtimeinstall.VerifySignedReleaseFile(runtimeinstall.SignatureVerificationRequest{
		ChecksumsPath: arguments[1],
		PublicKey:     arguments[3],
		SignaturePath: arguments[5],
	}, arguments[7])
}
