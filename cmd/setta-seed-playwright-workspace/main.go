package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"setta/internal/e2eseed"
)

func main() {
	settaFilesRoot := flag.String("setta-files-root", "", "path to the setta_files directory to seed")
	projectID := flag.String("project-id", "", "project id to seed")
	projectName := flag.String("project-name", "", "project name to seed")
	canvasFlowPerfNodeCounts := flag.String(
		"canvasflow-perf-node-counts",
		"",
		"comma-separated CanvasFlow performance project node counts to seed",
	)
	flag.Parse()

	if strings.TrimSpace(*settaFilesRoot) == "" {
		fmt.Fprintln(os.Stderr, "setta-seed-playwright-workspace: -setta-files-root is required")
		os.Exit(2)
	}

	if err := e2eseed.SeedProjectState(context.Background(), e2eseed.ProjectStateSeedOptions{
		SettaFilesRoot:           *settaFilesRoot,
		ProjectID:                *projectID,
		ProjectName:              *projectName,
		CanvasFlowPerfNodeCounts: parseCanvasFlowPerfNodeCounts(*canvasFlowPerfNodeCounts),
	}); err != nil {
		fmt.Fprintf(os.Stderr, "setta-seed-playwright-workspace: %v\n", err)
		os.Exit(1)
	}
}

func parseCanvasFlowPerfNodeCounts(raw string) []int {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	counts := make([]int, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		count, err := strconv.Atoi(trimmed)
		if err != nil || count <= 0 {
			fmt.Fprintf(
				os.Stderr,
				"setta-seed-playwright-workspace: invalid --canvasflow-perf-node-counts value %q\n",
				trimmed,
			)
			os.Exit(2)
		}
		counts = append(counts, count)
	}
	return counts
}
