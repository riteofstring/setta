package main

import (
	"fmt"
	"os"

	"setta/internal/settacmd"
)

func main() {
	if err := settacmd.Run(os.Args[1:], settacmd.RunOptions{
		Stdout: os.Stdout,
		Stderr: os.Stderr,
		Stdin:  os.Stdin,
	}); err != nil {
		if settacmd.ShouldPrintError(err) {
			fmt.Fprintln(os.Stderr, settacmd.DisplayError(err))
		}
		os.Exit(settacmd.ExitCode(err))
	}
}
