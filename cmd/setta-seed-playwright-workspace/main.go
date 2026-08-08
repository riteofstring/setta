package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"setta/internal/e2eseed"
)

func main() {
	settaFilesRoot := flag.String("setta-files-root", "", "path to the setta_files directory to seed")
	projectID := flag.String("project-id", "", "project id to seed")
	projectName := flag.String("project-name", "", "project name to seed")
	flag.Parse()

	if strings.TrimSpace(*settaFilesRoot) == "" {
		fmt.Fprintln(os.Stderr, "setta-seed-playwright-workspace: -setta-files-root is required")
		os.Exit(2)
	}

	if err := e2eseed.SeedProjectState(context.Background(), e2eseed.ProjectStateSeedOptions{
		SettaFilesRoot: *settaFilesRoot,
		ProjectID:      *projectID,
		ProjectName:    *projectName,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "setta-seed-playwright-workspace: %v\n", err)
		os.Exit(1)
	}
}
