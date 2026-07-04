package chat

import (
	"regexp"
	"strings"
)

// Friendly command summaries modeled on Codex's ParsedCommand
// (reference_repos/codex/codex-rs/shell-command/src/parse_command.rs). The shell
// wrapper (/bin/zsh -lc '…') is unwrapped so a row shows the real command, and the
// common read/search/list tools get a verb. Anything else shows the unwrapped
// command verbatim. This is provider-text interpretation, so it lives in the Go
// projection rather than the renderer.

var (
	commandReadTools   = map[string]bool{"cat": true, "bat": true, "batcat": true, "head": true, "tail": true, "nl": true, "less": true, "more": true}
	commandSearchTools = map[string]bool{"rg": true, "rga": true, "ripgrep-all": true, "grep": true, "egrep": true, "fgrep": true, "ag": true, "ack": true}
	commandListTools   = map[string]bool{"ls": true, "eza": true, "exa": true, "fd": true, "fdfind": true, "find": true}

	shellWrapperPattern = regexp.MustCompile(`^(?:\S*/)?(?:ba|z|k|d|a)?sh\s+-[a-z]*c[a-z]*\s+([\s\S]+)$`)
	commandTokenPattern = regexp.MustCompile(`(?:[^\s'"]+|'[^']*'|"[^"]*")+`)
)

// summarizeCommandLabel returns a one-line label for a shell command: a verb for
// known read/search/list tools, otherwise the unwrapped command itself.
func summarizeCommandLabel(rawCommand string) string {
	command := unwrapShellCommand(rawCommand)
	tokens := tokenizeCommand(commandSourceStage(command))
	head, second := "", ""
	if len(tokens) > 0 {
		head = tokens[0]
	}
	if len(tokens) > 1 {
		second = tokens[1]
	}
	switch {
	case head == "git" && second == "ls-files":
		return "Listed files"
	case head == "git" && second == "grep":
		return commandVerbLabel("Searched", firstCommandOperand(tokens[2:]), command)
	case commandReadTools[head]:
		return commandVerbLabel("Read", commandFileName(firstCommandOperand(tokens[1:])), command)
	case commandSearchTools[head]:
		return commandVerbLabel("Searched", firstCommandOperand(tokens[1:]), command)
	case commandListTools[head]:
		target := firstCommandOperand(tokens[1:])
		if target == "" {
			target = "files"
		}
		return "Listed " + target
	default:
		return command
	}
}

func commandVerbLabel(verb string, target string, command string) string {
	if target == "" {
		return command
	}
	return verb + " " + target
}

func unwrapShellCommand(raw string) string {
	trimmed := strings.TrimSpace(raw)
	match := shellWrapperPattern.FindStringSubmatch(trimmed)
	if match == nil {
		return trimmed
	}
	stripped := stripWrappingQuotes(strings.TrimSpace(match[1]))
	if stripped == "" {
		return trimmed
	}
	return stripped
}

func stripWrappingQuotes(value string) string {
	if len(value) < 2 {
		return value
	}
	first := value[0]
	if (first == '\'' || first == '"') && value[len(value)-1] == first {
		inner := value[1 : len(value)-1]
		return strings.ReplaceAll(inner, "\\"+string(first), string(first))
	}
	return value
}

// commandSourceStage returns the command that produces the data: the segment after
// the last `&&` (skipping a leading `cd`), and the first stage of a pipe. It is a
// best-effort reduction, not a full shell parse.
func commandSourceStage(command string) string {
	afterAnd := command
	if parts := strings.Split(command, "&&"); len(parts) > 0 {
		afterAnd = strings.TrimSpace(parts[len(parts)-1])
	}
	return strings.TrimSpace(strings.SplitN(afterAnd, "|", 2)[0])
}

func tokenizeCommand(segment string) []string {
	matches := commandTokenPattern.FindAllString(segment, -1)
	tokens := make([]string, 0, len(matches))
	for _, match := range matches {
		tokens = append(tokens, stripWrappingQuotes(match))
	}
	return tokens
}

func firstCommandOperand(args []string) string {
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			return arg
		}
	}
	return ""
}

func commandFileName(path string) string {
	if path == "" {
		return ""
	}
	segments := strings.Split(path, "/")
	for index := len(segments) - 1; index >= 0; index-- {
		if segments[index] != "" {
			return segments[index]
		}
	}
	return path
}
