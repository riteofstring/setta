package evalharness

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const resultArtifactDirectoryTimestamp = "20060102T150405.000000000Z"

type ResultArtifactPaths struct {
	Directory      string
	ResultsJSON    string
	ReportMarkdown string
}

// WriteResultArtifacts publishes the Phase 1 artifact pair as one directory.
// Files are completed in a private sibling directory before the directory is
// renamed into place, so a consumer never observes a partial result/report
// pair.
func WriteResultArtifacts(recordingsRoot string, results Results) (ResultArtifactPaths, error) {
	if err := results.Validate(); err != nil {
		return ResultArtifactPaths{}, err
	}
	root, err := prepareResultArtifactRoot(recordingsRoot)
	if err != nil {
		return ResultArtifactPaths{}, err
	}
	directoryName := results.StartedAt.UTC().Format(resultArtifactDirectoryTimestamp)
	finalDirectory := filepath.Join(root, directoryName)
	if _, err := os.Lstat(finalDirectory); err == nil {
		return ResultArtifactPaths{}, fmt.Errorf("eval artifact directory already exists: %s", finalDirectory)
	} else if !errors.Is(err, os.ErrNotExist) {
		return ResultArtifactPaths{}, fmt.Errorf("inspect eval artifact destination: %w", err)
	}

	pendingDirectory, err := os.MkdirTemp(root, ".pending-")
	if err != nil {
		return ResultArtifactPaths{}, fmt.Errorf("create pending eval artifact directory: %w", err)
	}
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(pendingDirectory)
		}
	}()

	resultsPath := filepath.Join(pendingDirectory, "results.json")
	if err := writeResultJSONFile(resultsPath, results); err != nil {
		return ResultArtifactPaths{}, err
	}
	report, err := RenderResultReport(results)
	if err != nil {
		return ResultArtifactPaths{}, err
	}
	reportPath := filepath.Join(pendingDirectory, "report.md")
	if err := writeResultFile(reportPath, func(writer io.Writer) error {
		_, err := io.WriteString(writer, report)
		return err
	}); err != nil {
		return ResultArtifactPaths{}, err
	}
	if err := os.Rename(pendingDirectory, finalDirectory); err != nil {
		return ResultArtifactPaths{}, fmt.Errorf("publish eval artifact directory: %w", err)
	}
	published = true
	return ResultArtifactPaths{
		Directory:      finalDirectory,
		ResultsJSON:    filepath.Join(finalDirectory, "results.json"),
		ReportMarkdown: filepath.Join(finalDirectory, "report.md"),
	}, nil
}

func RenderResultReport(results Results) (string, error) {
	if err := results.Validate(); err != nil {
		return "", err
	}
	var report strings.Builder
	report.WriteString("# Setta Live AI Evaluation\n\n")
	fmt.Fprintf(&report, "Setta commit: `%s`  \n", results.SettaCommit)
	fmt.Fprintf(&report, "Started: `%s`  \n", results.StartedAt.Format(time.RFC3339Nano))
	fmt.Fprintf(&report, "Finished: `%s`\n\n", results.FinishedAt.Format(time.RFC3339Nano))

	report.WriteString("## Ability\n\n")
	report.WriteString("| Scenario | Classification | Execution | Hidden verifier |\n")
	report.WriteString("| --- | --- | --- | --- |\n")
	for _, scenario := range results.Scenarios {
		fmt.Fprintf(
			&report,
			"| `%s` | %s | %s | %s |\n",
			escapeMarkdownTableCell(scenario.ScenarioID),
			escapeMarkdownTableCell(string(scenario.Classification)),
			escapeMarkdownTableCell(string(scenario.ExecutionOutcome)),
			verifierReportLabel(scenario),
		)
	}
	writeScenarioDiagnostics(&report, results.Scenarios)

	report.WriteString("## User Control\n\n")
	report.WriteString("Phase 1 records the objective terminal outcome only. The typed control assertions are added with the remaining MVP scenarios in Phase 3.\n\n")

	report.WriteString("## AI Communication\n\n")
	report.WriteString("Communication is not scored in Phase 1. Phase 2 adds the user-visible transcript and fixed communication judge.\n\n")

	report.WriteString("## Efficiency\n\n")
	report.WriteString("| Scenario | Duration | Production role resolution |\n")
	report.WriteString("| --- | --- | --- |\n")
	for _, scenario := range results.Scenarios {
		fmt.Fprintf(
			&report,
			"| `%s` | %s | %s |\n",
			escapeMarkdownTableCell(scenario.ScenarioID),
			(time.Duration(scenario.DurationMilliseconds) * time.Millisecond).String(),
			escapeMarkdownTableCell(roleResolutionReportLabel(scenario.Roles)),
		)
	}
	report.WriteString("\nExact system-token accounting is added in Phase 2; duration and resolved models are diagnostics until then.\n")
	return report.String(), nil
}

func prepareResultArtifactRoot(recordingsRoot string) (string, error) {
	if strings.TrimSpace(recordingsRoot) == "" {
		return "", errors.New("eval recordings root is required")
	}
	root, err := filepath.Abs(recordingsRoot)
	if err != nil {
		return "", fmt.Errorf("resolve eval recordings root: %w", err)
	}
	if root != filepath.Clean(recordingsRoot) {
		return "", fmt.Errorf("eval recordings root must be an absolute clean path: %s", recordingsRoot)
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", fmt.Errorf("create eval recordings root: %w", err)
	}
	info, err := os.Lstat(root)
	if err != nil {
		return "", fmt.Errorf("inspect eval recordings root: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", fmt.Errorf("eval recordings root must be a directory, not a symbolic link: %s", root)
	}
	return root, nil
}

func writeResultJSONFile(path string, results Results) error {
	return writeResultFile(path, func(writer io.Writer) error {
		encoder := json.NewEncoder(writer)
		encoder.SetEscapeHTML(false)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(results); err != nil {
			return fmt.Errorf("encode eval results: %w", err)
		}
		return nil
	})
}

func writeResultFile(path string, write func(io.Writer) error) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("create eval artifact %s: %w", filepath.Base(path), err)
	}
	writeErr := write(file)
	syncErr := file.Sync()
	closeErr := file.Close()
	if writeErr != nil {
		return fmt.Errorf("write eval artifact %s: %w", filepath.Base(path), writeErr)
	}
	if syncErr != nil {
		return fmt.Errorf("sync eval artifact %s: %w", filepath.Base(path), syncErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close eval artifact %s: %w", filepath.Base(path), closeErr)
	}
	return nil
}

func verifierReportLabel(result ScenarioResult) string {
	if result.Verifier == nil {
		return "not run"
	}
	if result.Verifier.Passed {
		return "pass"
	}
	return "fail"
}

func writeScenarioDiagnostics(report *strings.Builder, scenarios []ScenarioResult) {
	wroteHeading := false
	for _, scenario := range scenarios {
		if scenario.Diagnostic == nil {
			continue
		}
		if !wroteHeading {
			report.WriteString("\nDiagnostics:\n\n")
			wroteHeading = true
		}
		fmt.Fprintf(
			report,
			"- `%s` — `%s`: %s\n",
			escapeMarkdownInline(scenario.ScenarioID),
			escapeMarkdownInline(scenario.Diagnostic.Code),
			escapeMarkdownInline(scenario.Diagnostic.Message),
		)
	}
	report.WriteString("\n")
}

func roleResolutionReportLabel(roles []EvaluatedRoleConfiguration) string {
	if len(roles) == 0 {
		return "unavailable"
	}
	parts := make([]string, 0, len(roles))
	for _, role := range roles {
		selection := fmt.Sprintf(
			"%s=%s/%s",
			role.Role,
			role.Resolved.ModelID,
			role.Resolved.ReasoningEffort,
		)
		if role.Resolved.ServiceTier != nil {
			selection += "/" + *role.Resolved.ServiceTier
		}
		parts = append(parts, selection)
	}
	return strings.Join(parts, "; ")
}

func escapeMarkdownTableCell(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "|", "\\|")
	value = strings.ReplaceAll(value, "\r\n", "<br>")
	value = strings.ReplaceAll(value, "\r", "<br>")
	return strings.ReplaceAll(value, "\n", "<br>")
}

func escapeMarkdownInline(value string) string {
	value = strings.ReplaceAll(value, "`", "'")
	value = strings.ReplaceAll(value, "\r\n", " ")
	value = strings.ReplaceAll(value, "\r", " ")
	return strings.ReplaceAll(value, "\n", " ")
}
