package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type provisionUpOptions struct {
	AppDataDir                   string
	Approve                      bool
	CloudFormationParametersFile string
	CloudFormationTemplateFile   string
	CloudInitFile                string
	DiskGB                       int
	InstanceType                 string
	JSON                         bool
	PlanOnly                     bool
	Provider                     string
	Region                       string
	RuntimeName                  string
	Shape                        string
	StackName                    string
	Timeout                      time.Duration
}

type provisionUpResult struct {
	OK             bool                          `json:"ok"`
	Mode           string                        `json:"mode"`
	Provider       string                        `json:"provider"`
	Plan           provisionExecutionPlan        `json:"plan"`
	CreationRecord *provisionCreationRecord      `json:"creationRecord,omitempty"`
	Execution      *provisionExecutionRunResult  `json:"execution,omitempty"`
	NextActions    []provisionCreationNextAction `json:"nextActions,omitempty"`
	Warnings       []string                      `json:"warnings,omitempty"`
}

const defaultProvisionUpTimeout = 10 * time.Minute

func runProvisionUp(args []string, deps cliDeps) error {
	options, warnings, err := provisionUpOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	plan, err := planProvisionUp(options)
	if err != nil {
		return err
	}
	if !options.PlanOnly {
		return runApprovedProvisionUp(options, plan, warnings, deps)
	}
	return encodeProvisionJSON(deps, provisionUpResult{
		OK:       true,
		Mode:     "plan_only",
		Provider: options.Provider,
		Plan:     plan,
		Warnings: warnings,
	}, "up JSON")
}

func provisionUpOptionsFromArgs(args []string, deps cliDeps) (provisionUpOptions, []string, error) {
	options := provisionUpOptions{
		Shape:   defaultProvisionShape,
		Timeout: defaultProvisionUpTimeout,
	}
	flagSet := newFlagSet("setta provision up", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.BoolVar(&options.PlanOnly, "plan-only", false, "render the allowlisted execution plan without running provider mutation")
	flagSet.BoolVar(&options.Approve, "approve", false, "confirm the reviewed mutation plan and run the provider CLI")
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", "", "directory for non-secret provisioning creation records")
	flagSet.StringVar(&options.Provider, "provider", "", "provider id; defaults to the catalog default")
	flagSet.StringVar(&options.RuntimeName, "runtime-name", "", "Tailscale hostname for the runtime")
	flagSet.StringVar(&options.Shape, "shape", options.Shape, "machine shape used for fallback instance selection")
	flagSet.StringVar(&options.Region, "region", "", "provider region or location")
	flagSet.IntVar(&options.DiskGB, "disk-gb", 0, "boot disk size in GiB; defaults to the shape floor")
	flagSet.StringVar(&options.InstanceType, "instance-type", "", "exact provider instance type")
	flagSet.StringVar(&options.CloudInitFile, "cloud-init-file", "", "provider user-data file for providers that accept cloud-init directly")
	flagSet.StringVar(&options.StackName, "stack-name", "", "AWS CloudFormation stack name")
	flagSet.StringVar(&options.CloudFormationTemplateFile, "cloudformation-template-file", "", "AWS CloudFormation template-body file")
	flagSet.StringVar(&options.CloudFormationParametersFile, "cloudformation-parameters-file", "", "AWS CloudFormation parameters file")
	flagSet.DurationVar(&options.Timeout, "timeout", options.Timeout, "maximum time to wait for the provider CLI mutation")
	if err := flagSet.Parse(args); err != nil {
		return provisionUpOptions{}, nil, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionUpOptions{}, nil, usageError{err: errors.New("setta provision up does not accept positional arguments")}
	}
	if !options.JSON {
		return provisionUpOptions{}, nil, usageError{err: errors.New("setta provision up requires --json")}
	}
	if options.PlanOnly && options.Approve {
		return provisionUpOptions{}, nil, usageError{err: errors.New("use either --plan-only or --approve, not both")}
	}
	if !options.PlanOnly && !options.Approve {
		return provisionUpOptions{}, nil, errors.New("setta provision up requires --approve after reviewing the --plan-only JSON output")
	}
	if !options.PlanOnly {
		appDataDir, err := provisionAppDataDir(options.AppDataDir, deps)
		if err != nil {
			return provisionUpOptions{}, nil, err
		}
		options.AppDataDir = appDataDir
		if options.Timeout <= 0 {
			return provisionUpOptions{}, nil, fmt.Errorf("timeout must be positive: %s", options.Timeout)
		}
	}
	return normalizeProvisionUpOptions(options)
}

func provisionAppDataDir(value string, deps cliDeps) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		appDataDir, err := defaultAppDataDir(deps.getenv)
		if err != nil {
			return "", err
		}
		trimmed = appDataDir
	}
	if !filepath.IsAbs(trimmed) {
		return "", fmt.Errorf("app-data-dir must be absolute: %s", value)
	}
	return trimmed, nil
}

func normalizeProvisionUpOptions(options provisionUpOptions) (provisionUpOptions, []string, error) {
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return provisionUpOptions{}, nil, err
	}
	if options.Provider == "" {
		options.Provider = catalog.DefaultProvider
	}
	provider, ok := provisionCatalogProviderByID(catalog, strings.TrimSpace(options.Provider))
	if !ok {
		return provisionUpOptions{}, nil, usageError{err: fmt.Errorf("unknown provider %q", options.Provider)}
	}
	shape, ok := provisionCatalogShapeByID(catalog, strings.TrimSpace(options.Shape))
	if !ok {
		return provisionUpOptions{}, nil, usageError{err: fmt.Errorf("unknown shape %q", options.Shape)}
	}
	mapping, ok := provider.Mappings[shape.ID]
	if !ok {
		return provisionUpOptions{}, nil, usageError{err: fmt.Errorf("provider %q does not have a fallback mapping for shape %q", provider.ID, shape.ID)}
	}
	runtimeName, err := validateCloudInitHostname(options.RuntimeName)
	if err != nil {
		return provisionUpOptions{}, nil, err
	}
	region, warnings := resolveRegion(provider.RegionPreferences, strings.TrimSpace(options.Region))
	instanceType := strings.TrimSpace(options.InstanceType)
	if instanceType == "" {
		instanceType = mapping.InstanceType
	}
	if _, err := requirePlainField("instance-type", instanceType, 1, 128); err != nil {
		return provisionUpOptions{}, nil, err
	}
	diskGB := resolveDiskGB(shape, mapping, options.DiskGB)
	options.Provider = provider.ID
	options.RuntimeName = runtimeName
	options.Shape = shape.ID
	options.Region = region
	options.InstanceType = instanceType
	options.DiskGB = diskGB
	return options, warnings, nil
}

func planProvisionUp(options provisionUpOptions) (provisionExecutionPlan, error) {
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return provisionExecutionPlan{}, err
	}
	provider, ok := provisionCatalogProviderByID(catalog, options.Provider)
	if !ok {
		return provisionExecutionPlan{}, usageError{err: fmt.Errorf("unknown provider %q", options.Provider)}
	}
	action := provisionExecutionAction{
		Provider:      options.Provider,
		Kind:          provisionActionCreateRuntime,
		RuntimeName:   options.RuntimeName,
		InstanceType:  options.InstanceType,
		Region:        options.Region,
		ImageSelector: provider.ImageSelector,
		DiskGB:        options.DiskGB,
		StackName:     options.StackName,
	}
	files, err := provisionUpFileInputs(options)
	if err != nil {
		return provisionExecutionPlan{}, err
	}
	action.FileInputs = files
	return buildProvisionExecutionPlan(action)
}

func runApprovedProvisionUp(options provisionUpOptions, plan provisionExecutionPlan, warnings []string, deps cliDeps) error {
	if !plan.Mutating || !plan.RequiresApproval {
		return fmt.Errorf("provision up plan %q is not an approval-gated mutation", plan.ActionID)
	}
	record, store, existing, err := reserveApprovedProvisionUpRecord(options, plan, deps)
	if err != nil {
		return err
	}
	if existing != nil {
		return encodeProvisionJSON(deps, provisionUpExistingRecordResult(options, plan, existing, warnings), "up JSON")
	}
	runResult, runErr := executeProvisionPlan(options.Timeout, plan, deps)
	record = record.withExecutionResult(runResult, deps.now().UTC())
	return finishApprovedProvisionUp(options, plan, warnings, record, runResult, runErr, store, deps)
}

func reserveApprovedProvisionUpRecord(options provisionUpOptions, plan provisionExecutionPlan, deps cliDeps) (provisionCreationRecord, provisionCreationStore, *provisionCreationRecord, error) {
	record, err := newProvisionCreationRecord(options, plan, deps.now().UTC())
	if err != nil {
		return provisionCreationRecord{}, provisionCreationStore{}, nil, err
	}
	store := newProvisionCreationStore(options.AppDataDir, deps)
	existing, err := provisionUpExistingRecordBeforeCreate(store, record.RecordID)
	if err != nil {
		return provisionCreationRecord{}, provisionCreationStore{}, nil, err
	}
	if existing != nil {
		return record, store, existing, nil
	}
	if _, err := deps.lookPath(plan.CLIBinary); err != nil {
		return provisionCreationRecord{}, provisionCreationStore{}, nil, fmt.Errorf("%s CLI not found in PATH: %w", plan.CLIBinary, err)
	}
	existing, err = provisionUpCreatePendingRecord(store, record)
	if err != nil {
		return provisionCreationRecord{}, provisionCreationStore{}, nil, err
	}
	return record, store, existing, nil
}

func finishApprovedProvisionUp(options provisionUpOptions, plan provisionExecutionPlan, warnings []string, record provisionCreationRecord, runResult provisionExecutionRunResult, runErr error, store provisionCreationStore, deps cliDeps) error {
	if err := store.update(record); err != nil {
		if runErr != nil {
			return fmt.Errorf("provider command failed and creation record update failed: %w; record update error: %v", runErr, err)
		}
		return err
	}
	result := provisionUpResult{
		OK:             runErr == nil,
		Mode:           "executed",
		Provider:       options.Provider,
		Plan:           plan,
		CreationRecord: &record,
		Execution:      &runResult,
		Warnings:       append(warnings, runResult.Warnings...),
	}
	if encodeErr := encodeProvisionJSON(deps, result, "up JSON"); encodeErr != nil {
		return encodeErr
	}
	if runErr != nil {
		return runErr
	}
	return nil
}

func provisionUpExistingRecordBeforeCreate(store provisionCreationStore, recordID string) (*provisionCreationRecord, error) {
	record, ok, err := store.find(recordID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return &record, nil
}

func provisionUpCreatePendingRecord(store provisionCreationStore, record provisionCreationRecord) (*provisionCreationRecord, error) {
	if err := store.createPending(record); err != nil {
		var exists provisionCreationRecordExistsError
		if errors.As(err, &exists) {
			return &exists.Record, nil
		}
		return nil, err
	}
	return nil, nil
}

func provisionUpExistingRecordResult(options provisionUpOptions, plan provisionExecutionPlan, record *provisionCreationRecord, warnings []string) provisionUpResult {
	return provisionUpResult{
		OK:             false,
		Mode:           "existing_record",
		Provider:       options.Provider,
		Plan:           plan,
		CreationRecord: record,
		NextActions:    provisionCreationRecordNextActions(*record),
		Warnings:       warnings,
	}
}

func executeProvisionPlan(timeout time.Duration, plan provisionExecutionPlan, deps cliDeps) (provisionExecutionRunResult, error) {
	result, _, err := executeProvisionPlanWithOutput(timeout, plan, deps)
	return result, err
}

func executeProvisionPlanWithOutput(timeout time.Duration, plan provisionExecutionPlan, deps cliDeps) (provisionExecutionRunResult, []byte, error) {
	ctx, stop := signalContext()
	defer stop()
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	output, err := deps.commandRunner(runCtx, plan.Argv[0], plan.Argv[1:]...)
	result := provisionExecutionRunResultFromOutput(plan, output, err)
	if err != nil {
		return result, output, fmt.Errorf("provider command failed for %s: %w", plan.ActionID, err)
	}
	return result, output, nil
}

func provisionUpFileInputs(options provisionUpOptions) ([]provisionExecutionFileInput, error) {
	switch options.Provider {
	case "aws":
		template, err := provisionExecutionFileInputFromPath("cloudFormationTemplate", "CloudFormation template body", options.CloudFormationTemplateFile, false)
		if err != nil {
			return nil, err
		}
		parameters, err := provisionExecutionFileInputFromPath("cloudFormationParameters", "CloudFormation parameters with provisioning secrets", options.CloudFormationParametersFile, true)
		if err != nil {
			return nil, err
		}
		return []provisionExecutionFileInput{template, parameters}, nil
	case "hetzner":
		cloudInit, err := provisionExecutionFileInputFromPath("cloudInit", "cloud-init user data with provisioning secrets", options.CloudInitFile, true)
		if err != nil {
			return nil, err
		}
		return []provisionExecutionFileInput{cloudInit}, nil
	default:
		return nil, fmt.Errorf("provider %q has no provision up execution manifest entry", options.Provider)
	}
}

func provisionExecutionFileInputFromPath(name string, purpose string, filePath string, sensitive bool) (provisionExecutionFileInput, error) {
	trimmed := strings.TrimSpace(filePath)
	if trimmed == "" {
		return provisionExecutionFileInput{}, fmt.Errorf("%s file path is required", name)
	}
	if err := validateAbsoluteNoSpacePath(name+" file path", trimmed); err != nil {
		return provisionExecutionFileInput{}, err
	}
	info, err := os.Stat(trimmed)
	if err != nil {
		return provisionExecutionFileInput{}, fmt.Errorf("stat %s file: %w", name, err)
	}
	if info.IsDir() {
		return provisionExecutionFileInput{}, fmt.Errorf("%s file path is a directory: %s", name, trimmed)
	}
	if sensitive && info.Mode().Perm()&0o077 != 0 {
		return provisionExecutionFileInput{}, fmt.Errorf("%s file must not be readable or writable by group/other", name)
	}
	data, err := os.ReadFile(trimmed)
	if err != nil {
		return provisionExecutionFileInput{}, fmt.Errorf("read %s file: %w", name, err)
	}
	return normalizeProvisionExecutionFileInput(provisionExecutionFileInput{
		Name:      name,
		Path:      trimmed,
		Purpose:   purpose,
		SizeBytes: int64(len(data)),
		SHA256:    sha256Hex(data),
		Sensitive: sensitive,
	})
}
