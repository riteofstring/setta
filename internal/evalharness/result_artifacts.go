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
	Directory           string
	ManifestJSON        string
	EventsJSONL         string
	TranscriptJSON      string
	TokenUsageJSON      string
	VerifierResultsJSON string
	JudgeResultsJSON    string
	ResultsJSON         string
	ReportMarkdown      string
}

// WriteResultArtifacts publishes the current eval artifacts as one directory.
// Files are completed in a private sibling directory before the directory is
// renamed into place, so a consumer never observes a partial artifact set.
func WriteResultArtifacts(
	recordingsRoot string,
	artifactSet EvaluationArtifactSet,
) (ResultArtifactPaths, error) {
	if err := artifactSet.Validate(); err != nil {
		return ResultArtifactPaths{}, err
	}
	finalDirectory, pendingDirectory, err := prepareResultArtifactDirectories(
		recordingsRoot,
		artifactSet.Results.StartedAt,
	)
	if err != nil {
		return ResultArtifactPaths{}, err
	}
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(pendingDirectory)
		}
	}()

	if err := writePendingResultArtifacts(pendingDirectory, artifactSet); err != nil {
		return ResultArtifactPaths{}, err
	}
	if err := os.Rename(pendingDirectory, finalDirectory); err != nil {
		return ResultArtifactPaths{}, fmt.Errorf("publish eval artifact directory: %w", err)
	}
	published = true
	return ResultArtifactPaths{
		Directory:           finalDirectory,
		ManifestJSON:        filepath.Join(finalDirectory, "manifest.json"),
		EventsJSONL:         filepath.Join(finalDirectory, "events.jsonl"),
		TranscriptJSON:      filepath.Join(finalDirectory, "transcript.json"),
		TokenUsageJSON:      filepath.Join(finalDirectory, "token-usage.json"),
		VerifierResultsJSON: filepath.Join(finalDirectory, "verifier-results.json"),
		JudgeResultsJSON:    filepath.Join(finalDirectory, "judge-results.json"),
		ResultsJSON:         filepath.Join(finalDirectory, "results.json"),
		ReportMarkdown:      filepath.Join(finalDirectory, "report.md"),
	}, nil
}

func prepareResultArtifactDirectories(
	recordingsRoot string,
	startedAt time.Time,
) (string, string, error) {
	root, err := prepareResultArtifactRoot(recordingsRoot)
	if err != nil {
		return "", "", err
	}
	directoryName := startedAt.UTC().Format(resultArtifactDirectoryTimestamp)
	finalDirectory := filepath.Join(root, directoryName)
	if _, err := os.Lstat(finalDirectory); err == nil {
		return "", "", fmt.Errorf("eval artifact directory already exists: %s", finalDirectory)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", "", fmt.Errorf("inspect eval artifact destination: %w", err)
	}
	pendingDirectory, err := os.MkdirTemp(root, ".pending-")
	if err != nil {
		return "", "", fmt.Errorf("create pending eval artifact directory: %w", err)
	}
	return finalDirectory, pendingDirectory, nil
}

func writePendingResultArtifacts(
	pendingDirectory string,
	artifactSet EvaluationArtifactSet,
) error {
	jsonArtifacts := []struct {
		name  string
		value any
	}{
		{name: "manifest.json", value: artifactSet.Manifest},
		{name: "transcript.json", value: artifactSet.Transcript},
		{name: "token-usage.json", value: artifactSet.TokenUsage},
		{name: "verifier-results.json", value: artifactSet.VerifierResults},
		{name: "judge-results.json", value: artifactSet.JudgeResults},
		{name: "results.json", value: artifactSet.Results},
	}
	for _, artifact := range jsonArtifacts {
		if err := writeResultJSONFile(filepath.Join(pendingDirectory, artifact.name), artifact.value); err != nil {
			return err
		}
	}
	if err := writeEvaluationEventsFile(filepath.Join(pendingDirectory, "events.jsonl"), artifactSet.Events); err != nil {
		return err
	}
	report, err := RenderResultReport(artifactSet)
	if err != nil {
		return err
	}
	reportPath := filepath.Join(pendingDirectory, "report.md")
	return writeResultFile(reportPath, func(writer io.Writer) error {
		_, err := io.WriteString(writer, report)
		return err
	})
}

func RenderResultReport(artifactSet EvaluationArtifactSet) (string, error) {
	if err := artifactSet.Validate(); err != nil {
		return "", err
	}
	results := artifactSet.Results
	evidence := evaluationReportEvidenceByAttempt(artifactSet)
	var report strings.Builder
	report.WriteString("# Setta Live AI Evaluation\n\n")
	fmt.Fprintf(&report, "Setta commit: `%s`  \n", results.SettaCommit)
	if artifactSet.Manifest.Candidate == nil {
		report.WriteString("Role configuration: `production-baseline`  \n")
	} else {
		fmt.Fprintf(
			&report,
			"Role configuration: candidate `%s` (`%s`)  \n",
			escapeMarkdownInline(artifactSet.Manifest.Candidate.ID),
			artifactSet.Manifest.Candidate.SourceSHA256,
		)
	}
	fmt.Fprintf(&report, "Started: `%s`  \n", results.StartedAt.Format(time.RFC3339Nano))
	fmt.Fprintf(&report, "Finished: `%s`  \n", results.FinishedAt.Format(time.RFC3339Nano))
	fmt.Fprintf(
		&report,
		"First-attempt passes: **%d/%d**\n\n",
		firstAttemptPassCount(results.Scenarios),
		len(results.Scenarios),
	)

	report.WriteString("## Ability\n\n")
	report.WriteString("| Scenario | First attempt | Stability | Rerun |\n")
	report.WriteString("| --- | --- | --- | --- |\n")
	for _, scenario := range results.Scenarios {
		fmt.Fprintf(
			&report,
			"| `%s` | %s | %s | %s |\n",
			escapeMarkdownTableCell(scenario.ScenarioID),
			abilityAttemptReportLabel(scenario.FirstAttempt),
			escapeMarkdownTableCell(string(scenario.Stability)),
			optionalAbilityAttemptReportLabel(scenario.Rerun),
		)
	}
	writeScenarioDiagnostics(&report, results.Scenarios)
	report.WriteString("First-attempt success is the headline. Only a failed evaluated attempt receives one fresh rerun; infrastructure failure leaves stability unassessed.\n\n")

	report.WriteString("## User Control\n\n")
	report.WriteString("| Scenario | First attempt | Rerun |\n")
	report.WriteString("| --- | --- | --- |\n")
	for _, scenario := range results.Scenarios {
		fmt.Fprintf(
			&report,
			"| `%s` | %s | %s |\n",
			escapeMarkdownTableCell(scenario.ScenarioID),
			controlAttemptReportLabel(scenario.FirstAttempt),
			optionalControlAttemptReportLabel(scenario.Rerun),
		)
	}
	report.WriteString("\nControl verdicts reference typed Director submissions, trigger observations, trajectory events, final conversation state, and the narrow hidden-verifier checks that own corrected end states.\n\n")

	report.WriteString("## AI Communication\n\n")
	report.WriteString("| Scenario | First attempt | Rerun |\n")
	report.WriteString("| --- | --- | --- |\n")
	for _, scenario := range results.Scenarios {
		first := evidence[evaluationAttemptIdentity{ScenarioID: scenario.ScenarioID, Attempt: EvaluationAttemptFirst}]
		fmt.Fprintf(
			&report,
			"| `%s` | %s | %s |\n",
			escapeMarkdownTableCell(scenario.ScenarioID),
			communicationAttemptReportLabel(first.judge),
			optionalCommunicationAttemptReportLabel(scenario, evidence),
		)
	}
	report.WriteString("\nThe fixed judge sees only scripted user messages, user-visible Director and Narrator text, the small communication contract, and the deterministic verifier result.\n\n")

	report.WriteString("## Efficiency\n\n")
	report.WriteString("| Scenario | First attempt | Rerun |\n")
	report.WriteString("| --- | --- | --- |\n")
	for _, scenario := range results.Scenarios {
		first := evidence[evaluationAttemptIdentity{ScenarioID: scenario.ScenarioID, Attempt: EvaluationAttemptFirst}]
		fmt.Fprintf(
			&report,
			"| `%s` | %s | %s |\n",
			escapeMarkdownTableCell(scenario.ScenarioID),
			efficiencyAttemptReportLabel(scenario.FirstAttempt, first.usage),
			optionalEfficiencyAttemptReportLabel(scenario, evidence),
		)
	}
	report.WriteString("\nSystem totals include Director, Agent, Narrator, and Side Agent calls. Judge usage is recorded separately and excluded from every system total. First-attempt tokens are the efficiency headline; rerun tokens remain separate diagnostics and are never averaged into it.\n")
	return report.String(), nil
}

func validateResultTokenUsage(results Results, tokenUsage TokenUsageArtifact) error {
	if err := tokenUsage.Validate(); err != nil {
		return err
	}
	attempts := resultAttemptReferences(results)
	if len(attempts) != len(tokenUsage.Scenarios) {
		return fmt.Errorf("results contain %d attempts, token usage contains %d", len(attempts), len(tokenUsage.Scenarios))
	}
	for index, attempt := range attempts {
		usage := tokenUsage.Scenarios[index]
		if attempt.identity != (evaluationAttemptIdentity{ScenarioID: usage.ScenarioID, Attempt: usage.Attempt}) {
			return fmt.Errorf("result attempt[%d] is %s/%d, token usage attempt is %s/%d", index, attempt.identity.ScenarioID, attempt.identity.Attempt, usage.ScenarioID, usage.Attempt)
		}
	}
	return nil
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

func writeResultJSONFile(path string, value any) error {
	return writeResultFile(path, func(writer io.Writer) error {
		encoder := json.NewEncoder(writer)
		encoder.SetEscapeHTML(false)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(value); err != nil {
			return fmt.Errorf("encode eval artifact: %w", err)
		}
		return nil
	})
}

func writeEvaluationEventsFile(path string, events []EvaluationEvent) error {
	return writeResultFile(path, func(writer io.Writer) error {
		for index, event := range events {
			payload, err := json.Marshal(event)
			if err != nil {
				return fmt.Errorf("encode evaluation event[%d]: %w", index, err)
			}
			if len(payload) > EvaluationMaximumEventBytes {
				return fmt.Errorf(
					"evaluation event[%d] is %d bytes, maximum is %d",
					index,
					len(payload),
					EvaluationMaximumEventBytes,
				)
			}
			if _, err := writer.Write(append(payload, '\n')); err != nil {
				return err
			}
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

type evaluationReportAttemptEvidence struct {
	usage ScenarioTokenUsage
	judge ScenarioJudgeResult
}

func evaluationReportEvidenceByAttempt(
	artifacts EvaluationArtifactSet,
) map[evaluationAttemptIdentity]evaluationReportAttemptEvidence {
	evidence := make(
		map[evaluationAttemptIdentity]evaluationReportAttemptEvidence,
		len(artifacts.TokenUsage.Scenarios),
	)
	for index, usage := range artifacts.TokenUsage.Scenarios {
		identity := evaluationAttemptIdentity{ScenarioID: usage.ScenarioID, Attempt: usage.Attempt}
		evidence[identity] = evaluationReportAttemptEvidence{
			usage: usage,
			judge: artifacts.JudgeResults.Scenarios[index],
		}
	}
	return evidence
}

func firstAttemptPassCount(results []ScenarioEvaluationResult) int {
	passed := 0
	for _, result := range results {
		if result.FirstAttempt.Status == ScenarioAttemptStatusPass {
			passed++
		}
	}
	return passed
}

func abilityAttemptReportLabel(result ScenarioResult) string {
	return escapeMarkdownTableCell(fmt.Sprintf(
		"status=%s; classification=%s; execution=%s; verifier=%s",
		result.Status,
		result.Classification,
		result.ExecutionOutcome,
		verifierReportLabel(result),
	))
}

func optionalAbilityAttemptReportLabel(result *ScenarioResult) string {
	if result == nil {
		return "not run"
	}
	return abilityAttemptReportLabel(*result)
}

func controlAttemptReportLabel(result ScenarioResult) string {
	return escapeMarkdownTableCell(fmt.Sprintf(
		"overall=%s; clarification=%s; assertions=%s",
		controlReportLabel(result.Control),
		clarificationReportLabel(result.Control),
		controlAssertionsReportLabel(result.Control),
	))
}

func optionalControlAttemptReportLabel(result *ScenarioResult) string {
	if result == nil {
		return "not run"
	}
	return controlAttemptReportLabel(*result)
}

func communicationAttemptReportLabel(result ScenarioJudgeResult) string {
	return escapeMarkdownTableCell(fmt.Sprintf(
		"judge=%s; checks=%s; failure tags=%s",
		judgeReportLabel(result),
		judgeChecksReportLabel(result),
		judgeFailureTagsReportLabel(result),
	))
}

func optionalCommunicationAttemptReportLabel(
	result ScenarioEvaluationResult,
	evidence map[evaluationAttemptIdentity]evaluationReportAttemptEvidence,
) string {
	if result.Rerun == nil {
		return "not run"
	}
	rerun := evidence[evaluationAttemptIdentity{
		ScenarioID: result.ScenarioID,
		Attempt:    EvaluationAttemptRerun,
	}]
	return communicationAttemptReportLabel(rerun.judge)
}

func efficiencyAttemptReportLabel(
	result ScenarioResult,
	usage ScenarioTokenUsage,
) string {
	return escapeMarkdownTableCell(fmt.Sprintf(
		"duration=%s; system tokens=%s; by role=%s; roles=%s",
		(time.Duration(result.DurationMilliseconds) * time.Millisecond).String(),
		tokenTotalReportLabel(usage),
		tokenRolesReportLabel(usage),
		roleResolutionReportLabel(result.Roles),
	))
}

func optionalEfficiencyAttemptReportLabel(
	result ScenarioEvaluationResult,
	evidence map[evaluationAttemptIdentity]evaluationReportAttemptEvidence,
) string {
	if result.Rerun == nil {
		return "not run"
	}
	rerun := evidence[evaluationAttemptIdentity{
		ScenarioID: result.ScenarioID,
		Attempt:    EvaluationAttemptRerun,
	}]
	return efficiencyAttemptReportLabel(*result.Rerun, rerun.usage)
}

func scenarioResultAttempts(result ScenarioEvaluationResult) []ScenarioResult {
	attempts := []ScenarioResult{result.FirstAttempt}
	if result.Rerun != nil {
		attempts = append(attempts, *result.Rerun)
	}
	return attempts
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

func controlReportLabel(result ScenarioControlResult) string {
	if !result.EvidenceAvailable {
		return "unavailable (`" + escapeMarkdownInline(result.Diagnostic.Code) + "`)"
	}
	if result.Passed {
		return "pass"
	}
	return "fail"
}

func clarificationReportLabel(result ScenarioControlResult) string {
	if !result.EvidenceAvailable {
		return "unavailable"
	}
	outcome := "fail"
	if result.Clarification.Passed {
		outcome = "pass"
	}
	return escapeMarkdownTableCell(fmt.Sprintf(
		"%s=%s (scripted replies=%d)",
		result.Clarification.Policy,
		outcome,
		result.Clarification.ScriptedReplyCount,
	))
}

func controlAssertionsReportLabel(result ScenarioControlResult) string {
	if !result.EvidenceAvailable {
		return "unavailable"
	}
	if len(result.Assertions) == 0 {
		return "none"
	}
	parts := make([]string, len(result.Assertions))
	for index, assertion := range result.Assertions {
		outcome := "fail"
		if assertion.Passed {
			outcome = "pass"
		}
		parts[index] = string(assertion.Assertion) + "=" + outcome
	}
	return escapeMarkdownTableCell(strings.Join(parts, "; "))
}

func judgeReportLabel(result ScenarioJudgeResult) string {
	if !result.EvidenceAvailable {
		return "unavailable (`" + escapeMarkdownInline(result.Diagnostic.Code) + "`)"
	}
	if result.Verdict.OverallPass {
		return "pass"
	}
	return "fail"
}

func judgeChecksReportLabel(result ScenarioJudgeResult) string {
	if !result.EvidenceAvailable {
		return "unavailable"
	}
	checks := []struct {
		label  string
		passed bool
	}{
		{label: "progress sufficient", passed: result.Verdict.ProgressSufficient},
		{label: "progress restrained", passed: result.Verdict.ProgressRestrained},
		{label: "questions necessary", passed: result.Verdict.QuestionsNecessary},
		{label: "final truthful/actionable", passed: result.Verdict.FinalTruthfulActionable},
		{label: "mechanics hidden", passed: result.Verdict.InternalMechanicsHidden},
	}
	parts := make([]string, 0, len(checks))
	for _, check := range checks {
		outcome := "fail"
		if check.passed {
			outcome = "pass"
		}
		parts = append(parts, check.label+"="+outcome)
	}
	return escapeMarkdownTableCell(strings.Join(parts, "; "))
}

func judgeFailureTagsReportLabel(result ScenarioJudgeResult) string {
	if !result.EvidenceAvailable {
		return "unavailable"
	}
	if len(result.Verdict.FailureTags) == 0 {
		return "none"
	}
	parts := make([]string, len(result.Verdict.FailureTags))
	for index, tag := range result.Verdict.FailureTags {
		parts[index] = string(tag)
	}
	return escapeMarkdownTableCell(strings.Join(parts, ", "))
}

func writeScenarioDiagnostics(report *strings.Builder, scenarios []ScenarioEvaluationResult) {
	wroteHeading := false
	for _, scenario := range scenarios {
		for _, attempt := range scenarioResultAttempts(scenario) {
			if attempt.Diagnostic == nil {
				continue
			}
			if !wroteHeading {
				report.WriteString("\nDiagnostics:\n\n")
				wroteHeading = true
			}
			fmt.Fprintf(
				report,
				"- `%s` attempt %d — `%s`: %s\n",
				escapeMarkdownInline(scenario.ScenarioID),
				attempt.Attempt,
				escapeMarkdownInline(attempt.Diagnostic.Code),
				escapeMarkdownInline(attempt.Diagnostic.Message),
			)
		}
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

func tokenTotalReportLabel(usage ScenarioTokenUsage) string {
	if !usage.System.EvidenceAvailable {
		return "unavailable"
	}
	return fmt.Sprintf("%d", usage.System.Total.TotalTokens)
}

func tokenRolesReportLabel(usage ScenarioTokenUsage) string {
	if !usage.System.EvidenceAvailable {
		return "unavailable"
	}
	parts := make([]string, 0, len(usage.System.Roles))
	for _, role := range usage.System.Roles {
		parts = append(parts, fmt.Sprintf("%s=%d", role.Role, role.Total.TotalTokens))
	}
	return escapeMarkdownTableCell(strings.Join(parts, "; "))
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
