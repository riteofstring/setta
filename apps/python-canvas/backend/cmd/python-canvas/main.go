package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/setta/python-canvas/backend/internal/httpapi"
	"github.com/setta/python-canvas/backend/internal/project"
)

const defaultPort = 8080

func main() {
	if err := run(os.Args[1:], serve); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string, start func(uint16) error) error {
	flags := flag.NewFlagSet("python-canvas", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	port := flags.Uint("port", defaultPort, "loopback port")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("python-canvas does not accept positional arguments")
	}
	if *port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535")
	}
	return start(uint16(*port))
}

func serve(port uint16) error {
	return httpapi.ServeLoopback(port, project.InitialProjectSnapshot())
}
