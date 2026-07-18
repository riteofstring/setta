package chat

import (
	_ "embed"
	"strings"
)

//go:embed harness_prompts/codex_developer_instructions.md
var codexDeveloperInstructionsText string

func codexDeveloperInstructions() string {
	return strings.TrimSpace(codexDeveloperInstructionsText)
}
