package main

import (
	"encoding/json"
	"fmt"
	"os"
)

const backendProbeArg = "--setta-plugin-backend-probe"

func main() {
	if len(os.Args) == 2 && os.Args[1] == backendProbeArg {
		payload := map[string]any{
			"schemaVersion": 1,
			"routes": []map[string]any{
				{
					"path":    "/health",
					"methods": []string{"GET"},
				},
				{
					"path":    "/items",
					"methods": []string{"POST", "DELETE"},
				},
			},
			"staticDirs": []map[string]any{
				{
					"routePrefix": "/static",
					"dir":         "backend/static",
				},
			},
			"listenerEndpoints": []map[string]any{
				{
					"name": "route_backend_fixture_ping",
				},
			},
		}
		if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "encode backend probe: %v\n", err)
			os.Exit(1)
		}
		return
	}
}
