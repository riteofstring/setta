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
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
