package main

import (
	"fmt"
	"os"

	"setta/internal/settacli"
)

func main() {
	if err := settacli.Run(os.Args[1:], settacli.RunOptions{
		Stdout: os.Stdout,
		Stderr: os.Stderr,
	}); err != nil {
		if settacli.ShouldPrintError(err) {
			fmt.Fprintln(os.Stderr, settacli.DisplayError(err))
		}
		os.Exit(settacli.ExitCode(err))
	}
}
