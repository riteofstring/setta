package settacli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"setta/internal/agentdocs"
)

type agentSkillExportOutput struct {
	Path             string `json:"path"`
	CommandIndexPath string `json:"commandIndexPath"`
}

func handleAgentGuide(context *Context, args []string) error {
	flags := newFlagSet("agent guide")
	format := flags.String("format", "markdown", "guide format")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("agent guide does not accept positional arguments")
	}
	if *format != "markdown" {
		return invalidError("agent guide only supports --format markdown")
	}
	text := agentdocs.GuideMarkdown()
	if context.Globals.JSON {
		return context.writeCommandData([]string{"agent", "guide"}, agentGuideOutput{Format: "markdown", Text: text})
	}
	_, err := fmt.Fprint(context.Stdout, text)
	return err
}

func handleAgentSkillExport(context *Context, args []string) error {
	flags := newFlagSet("agent skill export")
	output := flags.String("output", "", "output directory")
	if err := flags.Parse(args); err != nil {
		return invalidError(err.Error())
	}
	if flags.NArg() != 0 {
		return invalidError("agent skill export does not accept positional arguments")
	}
	if *output == "" {
		return invalidError("agent skill export requires --output")
	}
	source := filepath.Join("skills", "setta-cli")
	if !existsDir(source) {
		return fmt.Errorf("source skill package not found: %s", source)
	}
	destination := filepath.Join(*output, "setta-cli")
	if err := copySkillPackage(source, destination); err != nil {
		return err
	}
	commandIndexPath := filepath.Join(destination, "references", "command-index.md")
	if err := os.MkdirAll(filepath.Dir(commandIndexPath), 0o755); err != nil {
		return fmt.Errorf("create command index directory: %w", err)
	}
	if err := os.WriteFile(commandIndexPath, []byte(agentdocs.CommandIndexMarkdown(commandEntries(context.Registry.Commands()))), 0o644); err != nil {
		return fmt.Errorf("write command index: %w", err)
	}
	return context.writeCommandData([]string{"agent", "skill", "export"}, agentSkillExportOutput{
		CommandIndexPath: commandIndexPath,
		Path:             destination,
	})
}

func commandEntries(commands []CommandSpec) []agentdocs.CommandEntry {
	entries := make([]agentdocs.CommandEntry, 0, len(commands))
	for _, command := range commands {
		entries = append(entries, agentdocs.CommandEntry{
			Dangerous:       command.Dangerous,
			Mutates:         command.Mutates,
			Path:            command.Path,
			RequiresBackend: command.RequiresBackend,
			Summary:         command.Summary,
			SupportsJSON:    command.SupportsJSON,
			SupportsNDJSON:  command.SupportsNDJSON,
			Usage:           command.Usage,
		})
	}
	return entries
}

func copySkillPackage(source string, destination string) error {
	sourceAbs, err := filepath.Abs(source)
	if err != nil {
		return fmt.Errorf("resolve source skill path: %w", err)
	}
	destinationAbs, err := filepath.Abs(destination)
	if err != nil {
		return fmt.Errorf("resolve destination skill path: %w", err)
	}
	if sourceAbs == destinationAbs {
		return nil
	}
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func copyFile(source string, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return fmt.Errorf("create directory for %s: %w", destination, err)
	}
	input, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open %s: %w", source, err)
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("open %s: %w", destination, err)
	}
	defer output.Close()
	if _, err := io.Copy(output, input); err != nil {
		return fmt.Errorf("copy %s to %s: %w", source, destination, err)
	}
	return nil
}
