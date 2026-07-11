package main

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
)

type provisionDownOptions struct {
	AppDataDir  string
	Approve     bool
	JSON        bool
	PlanOnly    bool
	Provider    string
	RecordID    string
	RuntimeName string
	Timeout     time.Duration
}

type provisionDownResult struct {
	OK             bool                         `json:"ok"`
	Mode           string                       `json:"mode"`
	Provider       string                       `json:"provider"`
	RecordID       string                       `json:"recordId"`
	Plan           provisionExecutionPlan       `json:"plan"`
	CreationRecord *provisionCreationRecord     `json:"creationRecord,omitempty"`
	Execution      *provisionExecutionRunResult `json:"execution,omitempty"`
}

const defaultProvisionDownTimeout = 5 * time.Minute

func runProvisionDown(args []string, deps cliDeps) error {
	options, err := provisionDownOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	store := newProvisionCreationStore(options.AppDataDir, deps)
	record, err := provisionDownRecord(options, store)
	if err != nil {
		return err
	}
	plan, err := provisionDownPlanFromRecord(record)
	if err != nil {
		return err
	}
	if options.PlanOnly {
		return encodeProvisionJSON(deps, provisionDownResult{
			OK:             true,
			Mode:           "plan_only",
			Provider:       record.Provider,
			RecordID:       record.RecordID,
			Plan:           plan,
			CreationRecord: &record,
		}, "down JSON")
	}
	return runApprovedProvisionDown(options, record, plan, store, deps)
}

func provisionDownOptionsFromArgs(args []string, deps cliDeps) (provisionDownOptions, error) {
	options := provisionDownOptions{
		Timeout: defaultProvisionDownTimeout,
	}
	flagSet := newFlagSet("setta provision down", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.BoolVar(&options.PlanOnly, "plan-only", false, "render the stored teardown plan without running provider mutation")
	flagSet.BoolVar(&options.Approve, "approve", false, "confirm the reviewed teardown plan and run the provider CLI")
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", "", "directory for non-secret provisioning creation records")
	flagSet.StringVar(&options.Provider, "provider", "", "provider id used to disambiguate runtime-name")
	flagSet.StringVar(&options.RecordID, "record-id", "", "exact provisioning creation record id")
	flagSet.StringVar(&options.RuntimeName, "runtime-name", "", "runtime name to tear down")
	flagSet.DurationVar(&options.Timeout, "timeout", options.Timeout, "maximum time to wait for the provider CLI deletion")
	if err := flagSet.Parse(args); err != nil {
		return provisionDownOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionDownOptions{}, usageError{err: errors.New("setta provision down does not accept positional arguments")}
	}
	return normalizeProvisionDownOptions(options, deps)
}

func normalizeProvisionDownOptions(options provisionDownOptions, deps cliDeps) (provisionDownOptions, error) {
	if err := validateProvisionDownMode(options); err != nil {
		return provisionDownOptions{}, err
	}
	if err := validateProvisionDownSelectorPresence(options); err != nil {
		return provisionDownOptions{}, err
	}
	normalized, err := normalizeProvisionDownSelector(options)
	if err != nil {
		return provisionDownOptions{}, err
	}
	options = normalized
	appDataDir, err := provisionAppDataDir(options.AppDataDir, deps)
	if err != nil {
		return provisionDownOptions{}, err
	}
	options.AppDataDir = appDataDir
	if options.Timeout <= 0 {
		return provisionDownOptions{}, fmt.Errorf("timeout must be positive: %s", options.Timeout)
	}
	return options, nil
}

func validateProvisionDownMode(options provisionDownOptions) error {
	if !options.JSON {
		return usageError{err: errors.New("setta provision down requires --json")}
	}
	if options.PlanOnly && options.Approve {
		return usageError{err: errors.New("use either --plan-only or --approve, not both")}
	}
	if !options.PlanOnly && !options.Approve {
		return errors.New("setta provision down requires --approve after reviewing the --plan-only JSON output")
	}
	return nil
}

func validateProvisionDownSelectorPresence(options provisionDownOptions) error {
	if options.RecordID != "" && options.RuntimeName != "" {
		return usageError{err: errors.New("use either --record-id or --runtime-name, not both")}
	}
	if options.RecordID == "" && options.RuntimeName == "" {
		return usageError{err: errors.New("setta provision down requires --record-id or --runtime-name")}
	}
	return nil
}

func normalizeProvisionDownSelector(options provisionDownOptions) (provisionDownOptions, error) {
	if options.RecordID != "" {
		recordID, err := requirePlainField("record-id", options.RecordID, 1, 256)
		if err != nil {
			return provisionDownOptions{}, err
		}
		options.RecordID = recordID
	}
	if options.RuntimeName != "" {
		runtimeName, err := validateCloudInitHostname(options.RuntimeName)
		if err != nil {
			return provisionDownOptions{}, err
		}
		options.RuntimeName = runtimeName
	}
	if options.Provider != "" {
		provider, err := requirePlainField("provider", options.Provider, 1, 64)
		if err != nil {
			return provisionDownOptions{}, err
		}
		options.Provider = provider
	}
	return options, nil
}

func provisionDownRecord(options provisionDownOptions, store provisionCreationStore) (provisionCreationRecord, error) {
	registry, err := store.read()
	if err != nil {
		return provisionCreationRecord{}, err
	}
	if options.RecordID != "" {
		return provisionDownRecordByID(registry, options)
	}
	return provisionDownRecordByRuntime(registry, options)
}

func provisionDownRecordByID(registry provisionCreationRegistry, options provisionDownOptions) (provisionCreationRecord, error) {
	record, ok := provisionCreationRecordByID(registry, options.RecordID)
	if !ok {
		return provisionCreationRecord{}, fmt.Errorf("provision creation record %q is missing", options.RecordID)
	}
	if options.Provider != "" && record.Provider != options.Provider {
		return provisionCreationRecord{}, fmt.Errorf("provision creation record %q provider is %q, not %q", record.RecordID, record.Provider, options.Provider)
	}
	return record, nil
}

func provisionDownRecordByRuntime(registry provisionCreationRegistry, options provisionDownOptions) (provisionCreationRecord, error) {
	matches := make([]provisionCreationRecord, 0, 1)
	for _, record := range registry.Creations {
		if record.RuntimeName != options.RuntimeName {
			continue
		}
		if options.Provider != "" && record.Provider != options.Provider {
			continue
		}
		matches = append(matches, record)
	}
	switch len(matches) {
	case 0:
		if options.Provider != "" {
			return provisionCreationRecord{}, fmt.Errorf("provision creation record for provider %q runtime %q is missing", options.Provider, options.RuntimeName)
		}
		return provisionCreationRecord{}, fmt.Errorf("provision creation record for runtime %q is missing", options.RuntimeName)
	case 1:
		return matches[0], nil
	default:
		ids := make([]string, 0, len(matches))
		for _, record := range matches {
			ids = append(ids, record.RecordID)
		}
		return provisionCreationRecord{}, fmt.Errorf("multiple provision creation records match runtime %q; pass --provider or --record-id: %s", options.RuntimeName, strings.Join(ids, ", "))
	}
}

func provisionDownPlanFromRecord(record provisionCreationRecord) (provisionExecutionPlan, error) {
	switch record.Status {
	case provisionCreationStatusSucceeded, provisionCreationStatusFailed:
	case provisionCreationStatusPending:
		return provisionExecutionPlan{}, fmt.Errorf("provision creation record %q is still pending; inspect it before teardown", record.RecordID)
	case provisionCreationStatusDeleted:
		return provisionExecutionPlan{}, fmt.Errorf("provision creation record %q is already deleted", record.RecordID)
	default:
		return provisionExecutionPlan{}, fmt.Errorf("provision creation record %q has unsupported status %q", record.RecordID, record.Status)
	}
	teardown := record.TeardownAction
	if !teardown.Ready {
		return provisionExecutionPlan{}, fmt.Errorf("provision creation record %q teardown is not ready; missing fields: %s", record.RecordID, strings.Join(teardown.MissingFields, ", "))
	}
	plan := provisionExecutionPlan{
		ActionID:         teardown.ActionID,
		Provider:         record.Provider,
		TypedAction:      teardown.TypedAction,
		CLIBinary:        teardown.CLIBinary,
		Argv:             append([]string(nil), teardown.RedactedArgv...),
		Mutating:         true,
		RequiresApproval: true,
		SecretFree:       true,
		LastVerified:     teardown.LastVerified,
	}
	if plan.TypedAction != provisionActionDeleteRuntime {
		return provisionExecutionPlan{}, fmt.Errorf("provision creation record %q teardown has typedAction %q, want %q", record.RecordID, plan.TypedAction, provisionActionDeleteRuntime)
	}
	if err := validateProvisionExecutionPlan(plan, nil); err != nil {
		return provisionExecutionPlan{}, err
	}
	if err := validateProvisionDownPlanAgainstManifest(record, plan); err != nil {
		return provisionExecutionPlan{}, err
	}
	return plan, nil
}

func validateProvisionDownPlanAgainstManifest(record provisionCreationRecord, plan provisionExecutionPlan) error {
	expected, err := expectedProvisionCreationTeardownPlan(record)
	if err != nil {
		return fmt.Errorf("validate stored teardown against manifest: %w", err)
	}
	if expected.ActionID != plan.ActionID ||
		expected.Provider != plan.Provider ||
		expected.TypedAction != plan.TypedAction ||
		expected.CLIBinary != plan.CLIBinary ||
		!expected.Mutating ||
		!expected.RequiresApproval ||
		!slices.Equal(expected.Argv, plan.Argv) {
		return fmt.Errorf("provision creation record %q stored teardown argv does not match the current allowlist manifest", record.RecordID)
	}
	return nil
}

func expectedProvisionCreationTeardownPlan(record provisionCreationRecord) (provisionExecutionPlan, error) {
	switch record.Provider {
	case "aws":
		return buildProvisionExecutionPlan(provisionExecutionAction{
			Provider:    record.Provider,
			Kind:        provisionActionDeleteRuntime,
			RuntimeName: record.RuntimeName,
			Region:      record.Region,
			StackName:   record.ExpectedResourceName,
		})
	case "hetzner":
		return buildProvisionExecutionPlan(provisionExecutionAction{
			Provider:   record.Provider,
			Kind:       provisionActionDeleteRuntime,
			ResourceID: record.ResourceID,
		})
	default:
		return provisionExecutionPlan{}, fmt.Errorf("provider %q has no teardown mapping", record.Provider)
	}
}

func runApprovedProvisionDown(options provisionDownOptions, record provisionCreationRecord, plan provisionExecutionPlan, store provisionCreationStore, deps cliDeps) error {
	if !plan.Mutating || !plan.RequiresApproval || plan.TypedAction != provisionActionDeleteRuntime {
		return fmt.Errorf("provision down plan %q is not an approval-gated delete mutation", plan.ActionID)
	}
	if _, err := deps.lookPath(plan.CLIBinary); err != nil {
		return fmt.Errorf("%s CLI not found in PATH: %w", plan.CLIBinary, err)
	}
	runResult, runErr := executeProvisionPlan(options.Timeout, plan, deps)
	record = record.withTeardownResult(runResult, deps.now().UTC())
	if err := store.update(record); err != nil {
		if runErr != nil {
			return fmt.Errorf("provider teardown failed and creation record update failed: %w; record update error: %v", runErr, err)
		}
		return err
	}
	result := provisionDownResult{
		OK:             runErr == nil,
		Mode:           "executed",
		Provider:       record.Provider,
		RecordID:       record.RecordID,
		Plan:           plan,
		CreationRecord: &record,
		Execution:      &runResult,
	}
	if encodeErr := encodeProvisionJSON(deps, result, "down JSON"); encodeErr != nil {
		return encodeErr
	}
	if runErr != nil {
		return runErr
	}
	return nil
}
