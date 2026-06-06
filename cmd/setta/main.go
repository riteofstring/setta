package main

import (
	"os"

	"setta/internal/settacli"
)

func main() {
	os.Exit(settacli.Run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, os.Getenv))
}
