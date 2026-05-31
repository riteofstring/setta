package agentdocs

import (
	"fmt"
	"strings"
)

type CommandEntry struct {
	Path            []string
	Summary         string
	Usage           string
	RequiresBackend bool
	Mutates         bool
	Dangerous       bool
	SupportsJSON    bool
	SupportsNDJSON  bool
}

func GuideMarkdown() string {
	return strings.TrimSpace(`# Setta CLI Agent Bootstrap

Use the `+"`setta`"+` CLI as the durable automation surface.

1. Run `+"`setta version --json`"+`.
2. Run `+"`setta commands --json`"+`.
3. Run `+"`setta backend connection --json`"+` before backend-backed commands.
4. Before unfamiliar commands, run `+"`setta help <command-path> --json`"+`.
5. Prefer `+"`--json`"+` for one-shot commands and `+"`--ndjson`"+` for streaming commands.
6. Use `+"`--no-input`"+` for automation.
7. Use explicit workspace, conversation, run, and approval IDs returned by JSON output.
8. Use `+"`--confirm`"+` only when the user requested the destructive operation.
9. Use `+"`setta api ...`"+` only when no workflow command covers the task.
`) + "\n"
}

func CommandIndexMarkdown(commands []CommandEntry) string {
	var builder strings.Builder
	builder.WriteString("# Setta CLI Command Index\n\n")
	builder.WriteString("Generated from the Setta CLI command registry. Use `setta help <command-path> --json` and `setta schema <command-path> --json` for current details.\n\n")
	for _, command := range commands {
		builder.WriteString("## ")
		builder.WriteString(strings.Join(command.Path, " "))
		builder.WriteString("\n\n")
		builder.WriteString(command.Summary)
		builder.WriteString("\n\n")
		builder.WriteString(fmt.Sprintf("- Usage: `%s`\n", command.Usage))
		builder.WriteString(fmt.Sprintf("- Requires backend: `%t`\n", command.RequiresBackend))
		builder.WriteString(fmt.Sprintf("- Mutates state: `%t`\n", command.Mutates))
		builder.WriteString(fmt.Sprintf("- Dangerous: `%t`\n", command.Dangerous))
		builder.WriteString(fmt.Sprintf("- JSON: `%t`\n", command.SupportsJSON))
		builder.WriteString(fmt.Sprintf("- NDJSON: `%t`\n\n", command.SupportsNDJSON))
	}
	return builder.String()
}
