package semanticgraph

import (
	"fmt"
	"strings"

	"setta/internal/chat"
)

func chatFileChangeDetailPaths(details *chat.RunItemFileChangeDetails) []string {
	paths := make([]string, 0, len(details.Paths))
	for _, path := range details.Paths {
		paths = append(paths, path.Path)
	}
	return paths
}

func chatFileChangeDetailSummary(details *chat.RunItemFileChangeDetails) string {
	parts := []string{}
	if details.PatchStatus != "" {
		parts = append(parts, details.PatchStatus)
	}
	if len(details.Paths) > 0 {
		parts = append(parts, fmt.Sprintf("%d file(s)", len(details.Paths)))
	}
	if details.Additions != 0 || details.Deletions != 0 {
		parts = append(parts, fmt.Sprintf("+%d -%d", details.Additions, details.Deletions))
	}
	for _, path := range details.Paths {
		pathParts := []string{path.Path}
		if path.Operation != nil {
			pathParts = append(pathParts, string(*path.Operation))
		}
		if path.MovePath != "" {
			pathParts = append(pathParts, "move:"+path.MovePath)
		}
		if path.Patch != "" {
			pathParts = append(pathParts, path.Patch)
		}
		parts = append(parts, strings.Join(pathParts, " "))
	}
	return strings.Join(parts, "\n")
}
