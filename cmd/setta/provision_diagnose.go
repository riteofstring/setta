package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type provisionDiagnoseOptions struct {
	AppDataDir  string
	JSON        bool
	Provider    string
	RecordID    string
	RuntimeName string
	Timeout     time.Duration
}

type provisionDiagnoseResult struct {
	OK             bool                         `json:"ok"`
	Provider       string                       `json:"provider"`
	RecordID       string                       `json:"recordId"`
	Plan           provisionExecutionPlan       `json:"plan"`
	CreationRecord *provisionCreationRecord     `json:"creationRecord,omitempty"`
	Diagnostic     *provisionCreationDiagnostic `json:"diagnostic,omitempty"`
	Execution      *provisionExecutionRunResult `json:"execution,omitempty"`
	Warnings       []string                     `json:"warnings,omitempty"`
}

const defaultProvisionDiagnoseTimeout = time.Minute

func runProvisionDiagnose(args []string, deps cliDeps) error {
	options, err := provisionDiagnoseOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	store := newProvisionCreationStore(options.AppDataDir, deps)
	record, err := provisionDiagnoseRecord(options, store)
	if err != nil {
		return err
	}
	plan, err := provisionDiagnosePlanFromRecord(record)
	if err != nil {
		return err
	}
	if plan.Mutating || plan.RequiresApproval || plan.TypedAction != provisionActionDiagnoseCreation {
		return fmt.Errorf("provision diagnose plan %q is not a read-only diagnosis action", plan.ActionID)
	}
	if _, err := deps.lookPath(plan.CLIBinary); err != nil {
		return fmt.Errorf("%s CLI not found in PATH: %w", plan.CLIBinary, err)
	}
	runResult, output, runErr := executeProvisionPlanWithOutput(options.Timeout, plan, deps)
	if trimmed := trimCommandOutput(output); trimmed != "" {
		runResult.ProviderOutput = trimmed
	}
	diagnostic := provisionCreationDiagnosticFromRun(plan, runResult, output, deps.now().UTC())
	record = record.withProviderDiagnostic(diagnostic, deps.now().UTC())
	if err := store.update(record); err != nil {
		if runErr != nil {
			return fmt.Errorf("provider diagnosis failed and creation record update failed: %w; record update error: %v", runErr, err)
		}
		return err
	}
	return encodeProvisionJSON(deps, provisionDiagnoseResult{
		OK:             runErr == nil,
		Provider:       record.Provider,
		RecordID:       record.RecordID,
		Plan:           plan,
		CreationRecord: &record,
		Diagnostic:     &diagnostic,
		Execution:      &runResult,
	}, "diagnose JSON")
}

func provisionDiagnoseOptionsFromArgs(args []string, deps cliDeps) (provisionDiagnoseOptions, error) {
	options := provisionDiagnoseOptions{
		Timeout: defaultProvisionDiagnoseTimeout,
	}
	flagSet := newFlagSet("setta provision diagnose", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", "", "directory for non-secret provisioning creation records")
	flagSet.StringVar(&options.Provider, "provider", "", "provider id used to disambiguate runtime-name")
	flagSet.StringVar(&options.RecordID, "record-id", "", "exact provisioning creation record id")
	flagSet.StringVar(&options.RuntimeName, "runtime-name", "", "runtime name to diagnose")
	flagSet.DurationVar(&options.Timeout, "timeout", options.Timeout, "maximum time to wait for the provider CLI diagnosis")
	if err := flagSet.Parse(args); err != nil {
		return provisionDiagnoseOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionDiagnoseOptions{}, usageError{err: errors.New("setta provision diagnose does not accept positional arguments")}
	}
	return normalizeProvisionDiagnoseOptions(options, deps)
}

func normalizeProvisionDiagnoseOptions(options provisionDiagnoseOptions, deps cliDeps) (provisionDiagnoseOptions, error) {
	if !options.JSON {
		return provisionDiagnoseOptions{}, usageError{err: errors.New("setta provision diagnose requires --json")}
	}
	if err := validateProvisionDiagnoseSelectorPresence(options); err != nil {
		return provisionDiagnoseOptions{}, err
	}
	normalized, err := normalizeProvisionDownSelector(provisionDownOptions{
		Provider:    options.Provider,
		RecordID:    options.RecordID,
		RuntimeName: options.RuntimeName,
	})
	if err != nil {
		return provisionDiagnoseOptions{}, err
	}
	options.Provider = normalized.Provider
	options.RecordID = normalized.RecordID
	options.RuntimeName = normalized.RuntimeName
	appDataDir, err := provisionAppDataDir(options.AppDataDir, deps)
	if err != nil {
		return provisionDiagnoseOptions{}, err
	}
	options.AppDataDir = appDataDir
	if options.Timeout <= 0 {
		return provisionDiagnoseOptions{}, fmt.Errorf("timeout must be positive: %s", options.Timeout)
	}
	return options, nil
}

func validateProvisionDiagnoseSelectorPresence(options provisionDiagnoseOptions) error {
	if options.RecordID != "" && options.RuntimeName != "" {
		return usageError{err: errors.New("use either --record-id or --runtime-name, not both")}
	}
	if options.RecordID == "" && options.RuntimeName == "" {
		return usageError{err: errors.New("setta provision diagnose requires --record-id or --runtime-name")}
	}
	return nil
}

func provisionDiagnoseRecord(options provisionDiagnoseOptions, store provisionCreationStore) (provisionCreationRecord, error) {
	registry, err := store.read()
	if err != nil {
		return provisionCreationRecord{}, err
	}
	selector := provisionDownOptions{
		Provider:    options.Provider,
		RecordID:    options.RecordID,
		RuntimeName: options.RuntimeName,
	}
	if selector.RecordID != "" {
		return provisionDownRecordByID(registry, selector)
	}
	return provisionDownRecordByRuntime(registry, selector)
}

func provisionDiagnosePlanFromRecord(record provisionCreationRecord) (provisionExecutionPlan, error) {
	switch record.Provider {
	case "aws":
		return buildProvisionExecutionPlan(provisionExecutionAction{
			Provider:  record.Provider,
			Kind:      provisionActionDiagnoseCreation,
			Region:    record.Region,
			StackName: record.ExpectedResourceName,
		})
	case "hetzner":
		if strings.TrimSpace(record.ResourceID) == "" {
			return provisionExecutionPlan{}, fmt.Errorf("provision creation record %q cannot be diagnosed by hcloud until resourceId is known", record.RecordID)
		}
		return buildProvisionExecutionPlan(provisionExecutionAction{
			Provider:   record.Provider,
			Kind:       provisionActionDiagnoseCreation,
			ResourceID: record.ResourceID,
		})
	default:
		return provisionExecutionPlan{}, fmt.Errorf("provider %q has no provision diagnosis manifest entry", record.Provider)
	}
}

func provisionCreationDiagnosticFromRun(plan provisionExecutionPlan, result provisionExecutionRunResult, output []byte, now time.Time) provisionCreationDiagnostic {
	return provisionCreationDiagnostic{
		ActionID:             plan.ActionID,
		TypedAction:          plan.TypedAction,
		CLIBinary:            plan.CLIBinary,
		RedactedArgv:         redactedProvisionExecutionArgv(plan),
		LastVerified:         plan.LastVerified,
		Status:               result.Status,
		CheckedAt:            now.Format(time.RFC3339Nano),
		ProviderOutputSHA256: result.ProviderOutputSHA256,
		Error:                result.Error,
		Summary:              provisionDiagnosticSummary(plan.Provider, output),
	}
}

func provisionDiagnosticSummary(provider string, output []byte) []string {
	switch provider {
	case "aws":
		return awsCloudFormationDiagnosisSummary(output)
	case "hetzner":
		return hetznerServerDiagnosisSummary(output)
	default:
		return nil
	}
}

func awsCloudFormationDiagnosisSummary(output []byte) []string {
	if strings.TrimSpace(string(output)) == "" {
		return nil
	}
	var parsed struct {
		StackEvents []struct {
			LogicalResourceID    string `json:"LogicalResourceId"`
			ResourceStatus       string `json:"ResourceStatus"`
			ResourceStatusReason string `json:"ResourceStatusReason"`
		} `json:"StackEvents"`
	}
	if err := json.Unmarshal(output, &parsed); err != nil {
		return nil
	}
	summary := make([]string, 0, 5)
	for _, event := range parsed.StackEvents {
		status := strings.TrimSpace(event.ResourceStatus)
		reason := strings.TrimSpace(event.ResourceStatusReason)
		if !isRelevantCloudFormationStatus(status) && reason == "" {
			continue
		}
		parts := []string{strings.TrimSpace(event.LogicalResourceID), status}
		if reason != "" {
			parts = append(parts, reason)
		}
		if line := provisionDiagnosticSummaryLine(parts); line != "" {
			summary = append(summary, line)
		}
		if len(summary) == 5 {
			break
		}
	}
	return summary
}

func isRelevantCloudFormationStatus(status string) bool {
	return strings.Contains(status, "FAILED") || strings.Contains(status, "ROLLBACK")
}

func hetznerServerDiagnosisSummary(output []byte) []string {
	if strings.TrimSpace(string(output)) == "" {
		return nil
	}
	var parsed struct {
		Server struct {
			ID     int64  `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"server"`
	}
	if err := json.Unmarshal(output, &parsed); err != nil {
		return nil
	}
	parts := []string{
		fmt.Sprintf("server %d", parsed.Server.ID),
		strings.TrimSpace(parsed.Server.Name),
		"status " + strings.TrimSpace(parsed.Server.Status),
	}
	if line := provisionDiagnosticSummaryLine(parts); line != "" {
		return []string{line}
	}
	return nil
}

func provisionDiagnosticSummaryLine(values []string) string {
	return strings.Join(nonEmptyStrings(values), ": ")
}

func nonEmptyStrings(values []string) []string {
	kept := make([]string, 0, len(values))
	for _, value := range values {
		if cleaned := strings.Join(strings.Fields(value), " "); cleaned != "" {
			kept = append(kept, cleaned)
		}
	}
	return kept
}
