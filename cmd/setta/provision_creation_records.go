package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	provisionCreationRecordFileName      = "provision-creations.json"
	provisionCreationRecordSchemaVersion = 1
)

type provisionCreationStatus string

const (
	provisionCreationStatusPending   provisionCreationStatus = "pending"
	provisionCreationStatusSucceeded provisionCreationStatus = "succeeded"
	provisionCreationStatusFailed    provisionCreationStatus = "failed"
	provisionCreationStatusDeleted   provisionCreationStatus = "deleted"
)

type provisionCreationRecord struct {
	RecordID             string                          `json:"recordId"`
	Status               provisionCreationStatus         `json:"status"`
	CreatedAt            string                          `json:"createdAt"`
	UpdatedAt            string                          `json:"updatedAt"`
	Provider             string                          `json:"provider"`
	RuntimeName          string                          `json:"runtimeName"`
	ExpectedResourceName string                          `json:"expectedResourceName"`
	Region               string                          `json:"region"`
	Shape                string                          `json:"shape"`
	InstanceType         string                          `json:"instanceType,omitempty"`
	DiskGB               int                             `json:"diskGb"`
	Tags                 []provisionCreationTag          `json:"tags"`
	CreateAction         provisionCreationActionRecord   `json:"createAction"`
	TeardownAction       provisionCreationTeardownRecord `json:"teardownAction"`
	InputDigests         []provisionCreationInputDigest  `json:"inputDigests,omitempty"`
	ProviderDiagnostics  []provisionCreationDiagnostic   `json:"providerDiagnostics,omitempty"`
	ResourceID           string                          `json:"resourceId,omitempty"`
	ProviderOutputSHA256 string                          `json:"providerOutputSha256,omitempty"`
	TeardownOutputSHA256 string                          `json:"teardownOutputSha256,omitempty"`
	DeletedAt            string                          `json:"deletedAt,omitempty"`
	LastError            string                          `json:"lastError,omitempty"`
}

type provisionCreationTag struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type provisionCreationActionRecord struct {
	ActionID     string                       `json:"actionId"`
	TypedAction  provisionExecutionActionKind `json:"typedAction"`
	CLIBinary    string                       `json:"cliBinary"`
	RedactedArgv []string                     `json:"redactedArgv"`
	LastVerified string                       `json:"lastVerified"`
}

type provisionCreationTeardownRecord struct {
	ActionID      string                       `json:"actionId,omitempty"`
	TypedAction   provisionExecutionActionKind `json:"typedAction,omitempty"`
	CLIBinary     string                       `json:"cliBinary,omitempty"`
	RedactedArgv  []string                     `json:"redactedArgv,omitempty"`
	LastVerified  string                       `json:"lastVerified,omitempty"`
	Ready         bool                         `json:"ready"`
	MissingFields []string                     `json:"missingFields,omitempty"`
}

type provisionCreationInputDigest struct {
	Name      string `json:"name"`
	Purpose   string `json:"purpose"`
	SizeBytes int64  `json:"sizeBytes"`
	SHA256    string `json:"sha256"`
	Sensitive bool   `json:"sensitive"`
}

type provisionCreationDiagnostic struct {
	ActionID             string                       `json:"actionId"`
	TypedAction          provisionExecutionActionKind `json:"typedAction"`
	CLIBinary            string                       `json:"cliBinary"`
	RedactedArgv         []string                     `json:"redactedArgv"`
	LastVerified         string                       `json:"lastVerified"`
	Status               provisionCreationStatus      `json:"status"`
	CheckedAt            string                       `json:"checkedAt"`
	ProviderOutputSHA256 string                       `json:"providerOutputSha256,omitempty"`
	Error                string                       `json:"error,omitempty"`
	Summary              []string                     `json:"summary,omitempty"`
}

type provisionCreationNextAction struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Mutating    bool   `json:"mutating"`
}

type provisionCreationRegistry struct {
	SchemaVersion int                       `json:"schemaVersion"`
	Creations     []provisionCreationRecord `json:"creations"`
}

type provisionExecutionRunResult struct {
	Status               provisionCreationStatus `json:"status"`
	ResourceID           string                  `json:"resourceId,omitempty"`
	ProviderOutput       string                  `json:"providerOutput,omitempty"`
	ProviderOutputSHA256 string                  `json:"providerOutputSha256,omitempty"`
	Error                string                  `json:"error,omitempty"`
	Warnings             []string                `json:"warnings,omitempty"`
}

type provisionCreationStore struct {
	path string
	deps cliDeps
}

type provisionCreationRecordExistsError struct {
	Record provisionCreationRecord
}

func (err provisionCreationRecordExistsError) Error() string {
	return fmt.Sprintf("provision creation record %q already exists with status %q; inspect it before retrying or use a different runtime name", err.Record.RecordID, err.Record.Status)
}

func newProvisionCreationStore(appDataDir string, deps cliDeps) provisionCreationStore {
	return provisionCreationStore{
		path: provisionCreationStorePath(appDataDir),
		deps: deps,
	}
}

func provisionCreationStorePath(appDataDir string) string {
	return filepath.Join(appDataDir, provisionCreationRecordFileName)
}

func newProvisionCreationRecord(options provisionUpOptions, plan provisionExecutionPlan, now time.Time) (provisionCreationRecord, error) {
	expectedResourceName, err := provisionCreationExpectedResourceName(options)
	if err != nil {
		return provisionCreationRecord{}, err
	}
	teardown, err := provisionCreationTeardownFor(options, "")
	if err != nil {
		return provisionCreationRecord{}, err
	}
	record := provisionCreationRecord{
		RecordID:             provisionCreationRecordID(options.Provider, expectedResourceName),
		Status:               provisionCreationStatusPending,
		CreatedAt:            now.Format(time.RFC3339Nano),
		UpdatedAt:            now.Format(time.RFC3339Nano),
		Provider:             options.Provider,
		RuntimeName:          options.RuntimeName,
		ExpectedResourceName: expectedResourceName,
		Region:               options.Region,
		Shape:                options.Shape,
		InstanceType:         options.InstanceType,
		DiskGB:               options.DiskGB,
		Tags:                 provisionCreationTags(options.RuntimeName),
		CreateAction:         provisionCreationActionFromPlan(plan),
		TeardownAction:       teardown,
		InputDigests:         provisionCreationInputDigests(plan.FileInputs),
	}
	if err := validateProvisionCreationRecord(record); err != nil {
		return provisionCreationRecord{}, err
	}
	return record, nil
}

func (record provisionCreationRecord) withExecutionResult(result provisionExecutionRunResult, now time.Time) provisionCreationRecord {
	record.Status = result.Status
	record.UpdatedAt = now.Format(time.RFC3339Nano)
	record.ProviderOutputSHA256 = result.ProviderOutputSHA256
	record.LastError = result.Error
	if result.ResourceID != "" {
		record.ResourceID = result.ResourceID
	}
	if record.ResourceID != "" {
		if teardown, err := provisionCreationTeardownFor(provisionUpOptions{
			Provider:    record.Provider,
			RuntimeName: record.RuntimeName,
			Region:      record.Region,
			StackName:   record.ExpectedResourceName,
		}, record.ResourceID); err == nil {
			record.TeardownAction = teardown
		}
	}
	return record
}

func (record provisionCreationRecord) withTeardownResult(result provisionExecutionRunResult, now time.Time) provisionCreationRecord {
	record.UpdatedAt = now.Format(time.RFC3339Nano)
	record.TeardownOutputSHA256 = result.ProviderOutputSHA256
	record.LastError = result.Error
	if result.Status == provisionCreationStatusSucceeded {
		record.Status = provisionCreationStatusDeleted
		record.DeletedAt = record.UpdatedAt
		record.LastError = ""
	}
	return record
}

func (record provisionCreationRecord) withProviderDiagnostic(diagnostic provisionCreationDiagnostic, now time.Time) provisionCreationRecord {
	record.UpdatedAt = now.Format(time.RFC3339Nano)
	record.ProviderDiagnostics = append(record.ProviderDiagnostics, diagnostic)
	if diagnostic.Error != "" {
		record.LastError = diagnostic.Error
	}
	return record
}

func (store provisionCreationStore) createPending(record provisionCreationRecord) error {
	if record.Status != provisionCreationStatusPending {
		return fmt.Errorf("new provision creation record %q must start pending", record.RecordID)
	}
	if err := validateProvisionCreationRecord(record); err != nil {
		return err
	}
	registry, err := store.read()
	if err != nil {
		return err
	}
	if existing, ok := provisionCreationRecordByID(registry, record.RecordID); ok {
		return provisionCreationRecordExistsError{Record: existing}
	}
	registry.Creations = append(registry.Creations, record)
	sortProvisionCreationRecords(registry.Creations)
	return store.write(registry)
}

func (store provisionCreationStore) find(recordID string) (provisionCreationRecord, bool, error) {
	registry, err := store.read()
	if err != nil {
		return provisionCreationRecord{}, false, err
	}
	record, ok := provisionCreationRecordByID(registry, recordID)
	return record, ok, nil
}

func (store provisionCreationStore) update(record provisionCreationRecord) error {
	if err := validateProvisionCreationRecord(record); err != nil {
		return err
	}
	registry, err := store.read()
	if err != nil {
		return err
	}
	replaced := false
	for index, existing := range registry.Creations {
		if existing.RecordID == record.RecordID {
			registry.Creations[index] = record
			replaced = true
			break
		}
	}
	if !replaced {
		return fmt.Errorf("provision creation record %q is missing", record.RecordID)
	}
	sortProvisionCreationRecords(registry.Creations)
	return store.write(registry)
}

func (store provisionCreationStore) read() (provisionCreationRegistry, error) {
	raw, err := os.ReadFile(store.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return emptyProvisionCreationRegistry(), nil
		}
		return provisionCreationRegistry{}, fmt.Errorf("read provision creation records: %w", err)
	}
	var registry provisionCreationRegistry
	if err := json.Unmarshal(raw, &registry); err != nil {
		return provisionCreationRegistry{}, fmt.Errorf("parse provision creation records: %w", err)
	}
	if registry.SchemaVersion != provisionCreationRecordSchemaVersion {
		return provisionCreationRegistry{}, fmt.Errorf("provision creation records schemaVersion = %d, want %d", registry.SchemaVersion, provisionCreationRecordSchemaVersion)
	}
	for _, record := range registry.Creations {
		if err := validateProvisionCreationRecord(record); err != nil {
			return provisionCreationRegistry{}, err
		}
	}
	sortProvisionCreationRecords(registry.Creations)
	return registry, nil
}

func (store provisionCreationStore) write(registry provisionCreationRegistry) error {
	registry.SchemaVersion = provisionCreationRecordSchemaVersion
	for _, record := range registry.Creations {
		if err := validateProvisionCreationRecord(record); err != nil {
			return err
		}
	}
	payload, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return fmt.Errorf("encode provision creation records: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(store.path), 0o700); err != nil {
		return fmt.Errorf("create provision creation record directory: %w", err)
	}
	tmpPath := fmt.Sprintf("%s.%d.%d.tmp", store.path, store.deps.pid(), store.deps.now().UTC().UnixNano())
	if err := os.WriteFile(tmpPath, append(payload, '\n'), 0o600); err != nil {
		return fmt.Errorf("write provision creation record temp file: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		return fmt.Errorf("chmod provision creation record temp file: %w", err)
	}
	if err := os.Rename(tmpPath, store.path); err != nil {
		return fmt.Errorf("replace provision creation record file: %w", err)
	}
	return nil
}

func emptyProvisionCreationRegistry() provisionCreationRegistry {
	return provisionCreationRegistry{
		SchemaVersion: provisionCreationRecordSchemaVersion,
		Creations:     []provisionCreationRecord{},
	}
}

func provisionCreationRecordByID(registry provisionCreationRegistry, recordID string) (provisionCreationRecord, bool) {
	for _, record := range registry.Creations {
		if record.RecordID == recordID {
			return record, true
		}
	}
	return provisionCreationRecord{}, false
}

func provisionCreationRecordNextActions(record provisionCreationRecord) []provisionCreationNextAction {
	actions := []provisionCreationNextAction{
		{
			ID:          "inspect_existing_record",
			Label:       "Inspect existing record",
			Description: fmt.Sprintf("Review creation record %s and its provider diagnostics before retrying.", record.RecordID),
			Mutating:    false,
		},
	}
	if record.Status == provisionCreationStatusSucceeded {
		actions = append(actions, provisionCreationNextAction{
			ID:          "adopt_existing_runtime",
			Label:       "Adopt existing runtime",
			Description: "Use the existing runtime or pairing flow if this resource is the intended Setta machine.",
			Mutating:    false,
		})
	}
	if provisionCreationRecordCanTeardown(record) {
		actions = append(actions, provisionCreationNextAction{
			ID:          "tear_down_existing_resource",
			Label:       "Review teardown",
			Description: "Review the stored teardown plan for this record before creating another resource with the same name.",
			Mutating:    true,
		})
	}
	actions = append(actions, provisionCreationNextAction{
		ID:          "use_different_runtime_name",
		Label:       "Use a different runtime name",
		Description: "Resolve again with a different runtime name to create a separate cloud resource.",
		Mutating:    false,
	})
	return actions
}

func provisionCreationRecordCanTeardown(record provisionCreationRecord) bool {
	if !record.TeardownAction.Ready {
		return false
	}
	switch record.Status {
	case provisionCreationStatusSucceeded, provisionCreationStatusFailed:
		return true
	default:
		return false
	}
}

func sortProvisionCreationRecords(records []provisionCreationRecord) {
	sort.Slice(records, func(left int, right int) bool {
		return records[left].RecordID < records[right].RecordID
	})
}

func provisionExecutionRunResultFromOutput(plan provisionExecutionPlan, output []byte, runErr error) provisionExecutionRunResult {
	result := provisionExecutionRunResult{
		Status: provisionCreationStatusSucceeded,
	}
	if len(output) > 0 {
		result.ProviderOutputSHA256 = sha256Hex(output)
	}
	if runErr != nil {
		result.Status = provisionCreationStatusFailed
		result.Error = runErr.Error()
		result.ProviderOutput = trimCommandOutput(output)
		return result
	}
	if plan.TypedAction == provisionActionCreateRuntime {
		resourceID, warnings := provisionCreationResourceIDFromProviderOutput(plan.Provider, output)
		result.ResourceID = resourceID
		result.Warnings = warnings
	}
	return result
}

func provisionCreationResourceIDFromProviderOutput(provider string, output []byte) (string, []string) {
	switch provider {
	case "aws":
		return awsStackIDFromCreateOutput(output)
	case "hetzner":
		return hetznerServerIDFromCreateOutput(output)
	default:
		return "", nil
	}
}

func awsStackIDFromCreateOutput(output []byte) (string, []string) {
	if len(bytes.TrimSpace(output)) == 0 {
		return "", nil
	}
	var parsed struct {
		StackID string `json:"StackId"`
	}
	if err := json.Unmarshal(output, &parsed); err != nil {
		return "", []string{fmt.Sprintf("could not parse AWS create-stack JSON output: %v", err)}
	}
	return strings.TrimSpace(parsed.StackID), nil
}

func hetznerServerIDFromCreateOutput(output []byte) (string, []string) {
	if len(bytes.TrimSpace(output)) == 0 {
		return "", []string{"hcloud returned no JSON output; teardown requires a server id"}
	}
	var parsed struct {
		Server struct {
			ID int64 `json:"id"`
		} `json:"server"`
	}
	if err := json.Unmarshal(output, &parsed); err != nil {
		return "", []string{fmt.Sprintf("could not parse hcloud create JSON output; teardown requires a server id: %v", err)}
	}
	if parsed.Server.ID <= 0 {
		return "", []string{"hcloud create JSON output did not include server.id; teardown requires a server id"}
	}
	return strconv.FormatInt(parsed.Server.ID, 10), nil
}

func provisionCreationExpectedResourceName(options provisionUpOptions) (string, error) {
	switch options.Provider {
	case "aws":
		return provisionExecutionFieldValue(provisionExecutionAction{
			RuntimeName: options.RuntimeName,
			StackName:   options.StackName,
		}, "stackName")
	case "hetzner":
		return validateCloudInitHostname(options.RuntimeName)
	default:
		return "", fmt.Errorf("provider %q has no creation record resource name mapping", options.Provider)
	}
}

func provisionCreationRecordID(provider string, expectedResourceName string) string {
	return provider + ":" + expectedResourceName
}

func provisionCreationTags(runtimeName string) []provisionCreationTag {
	return []provisionCreationTag{
		{Key: "setta:runtime", Value: "true"},
		{Key: "setta:runtime_name", Value: runtimeName},
		{Key: "setta:created_by", Value: "user"},
	}
}

func provisionCreationActionFromPlan(plan provisionExecutionPlan) provisionCreationActionRecord {
	return provisionCreationActionRecord{
		ActionID:     plan.ActionID,
		TypedAction:  plan.TypedAction,
		CLIBinary:    plan.CLIBinary,
		RedactedArgv: redactedProvisionExecutionArgv(plan),
		LastVerified: plan.LastVerified,
	}
}

func provisionCreationTeardownFor(options provisionUpOptions, resourceID string) (provisionCreationTeardownRecord, error) {
	switch options.Provider {
	case "aws":
		plan, err := buildProvisionExecutionPlan(provisionExecutionAction{
			Provider:    options.Provider,
			Kind:        provisionActionDeleteRuntime,
			RuntimeName: options.RuntimeName,
			Region:      options.Region,
			StackName:   options.StackName,
		})
		if err != nil {
			return provisionCreationTeardownRecord{}, err
		}
		return provisionCreationTeardownFromPlan(plan, nil), nil
	case "hetzner":
		if strings.TrimSpace(resourceID) == "" {
			return provisionCreationTeardownRecord{
				ActionID:      "hetzner.server.delete_runtime",
				TypedAction:   provisionActionDeleteRuntime,
				Ready:         false,
				MissingFields: []string{"resourceID"},
			}, nil
		}
		plan, err := buildProvisionExecutionPlan(provisionExecutionAction{
			Provider:   options.Provider,
			Kind:       provisionActionDeleteRuntime,
			ResourceID: resourceID,
		})
		if err != nil {
			return provisionCreationTeardownRecord{}, err
		}
		return provisionCreationTeardownFromPlan(plan, nil), nil
	default:
		return provisionCreationTeardownRecord{}, fmt.Errorf("provider %q has no teardown mapping", options.Provider)
	}
}

func provisionCreationTeardownFromPlan(plan provisionExecutionPlan, missing []string) provisionCreationTeardownRecord {
	return provisionCreationTeardownRecord{
		ActionID:      plan.ActionID,
		TypedAction:   plan.TypedAction,
		CLIBinary:     plan.CLIBinary,
		RedactedArgv:  redactedProvisionExecutionArgv(plan),
		LastVerified:  plan.LastVerified,
		Ready:         len(missing) == 0,
		MissingFields: missing,
	}
}

func provisionCreationInputDigests(inputs []provisionExecutionFileInput) []provisionCreationInputDigest {
	digests := make([]provisionCreationInputDigest, 0, len(inputs))
	for _, input := range inputs {
		digests = append(digests, provisionCreationInputDigest{
			Name:      input.Name,
			Purpose:   input.Purpose,
			SizeBytes: input.SizeBytes,
			SHA256:    input.SHA256,
			Sensitive: input.Sensitive,
		})
	}
	return digests
}

func redactedProvisionExecutionArgv(plan provisionExecutionPlan) []string {
	argv := append([]string(nil), plan.Argv...)
	for _, input := range plan.FileInputs {
		replacement := "__SETTA_FILE_" + strings.ToUpper(input.Name) + "_SHA256_" + input.SHA256 + "__"
		for index, arg := range argv {
			argv[index] = strings.ReplaceAll(arg, input.Path, replacement)
		}
	}
	return argv
}

func validateProvisionCreationRecord(record provisionCreationRecord) error {
	if err := validateProvisionCreationRecordHeader(record); err != nil {
		return err
	}
	if err := validateProvisionCreationRecordShape(record); err != nil {
		return err
	}
	if err := validateProvisionCreationAction(record.RecordID, record.CreateAction); err != nil {
		return err
	}
	if err := validateProvisionCreationTeardown(record.RecordID, record.TeardownAction); err != nil {
		return err
	}
	for _, diagnostic := range record.ProviderDiagnostics {
		if err := validateProvisionCreationDiagnostic(record.RecordID, diagnostic); err != nil {
			return err
		}
	}
	return nil
}

func validateProvisionCreationRecordHeader(record provisionCreationRecord) error {
	if _, err := requirePlainField("provision creation record id", record.RecordID, 1, 256); err != nil {
		return err
	}
	if !isSupportedProvisionCreationStatus(record.Status) {
		return fmt.Errorf("provision creation record %q has unsupported status %q", record.RecordID, record.Status)
	}
	for _, field := range []struct {
		label string
		value string
	}{
		{"createdAt", record.CreatedAt},
		{"updatedAt", record.UpdatedAt},
	} {
		if _, err := validateRFC3339NanoField("provision creation "+field.label, field.value); err != nil {
			return fmt.Errorf("provision creation record %q: %w", record.RecordID, err)
		}
	}
	if record.DeletedAt != "" {
		if _, err := validateRFC3339NanoField("provision creation deletedAt", record.DeletedAt); err != nil {
			return fmt.Errorf("provision creation record %q: %w", record.RecordID, err)
		}
	}
	return nil
}

func validateProvisionCreationRecordShape(record provisionCreationRecord) error {
	if _, err := requirePlainField("provision creation provider", record.Provider, 1, 64); err != nil {
		return err
	}
	if _, err := validateCloudInitHostname(record.RuntimeName); err != nil {
		return err
	}
	if _, err := requirePlainField("provision creation resource name", record.ExpectedResourceName, 1, 256); err != nil {
		return err
	}
	if _, err := requirePlainField("provision creation region", record.Region, 1, 128); err != nil {
		return err
	}
	if _, err := requirePlainField("provision creation shape", record.Shape, 1, 128); err != nil {
		return err
	}
	if record.DiskGB <= 0 {
		return fmt.Errorf("provision creation record %q diskGb must be positive", record.RecordID)
	}
	return nil
}

func validateProvisionCreationAction(recordID string, action provisionCreationActionRecord) error {
	if _, err := requirePlainField("provision creation action id", action.ActionID, 1, 128); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	if !isSupportedProvisionExecutionAction(action.TypedAction) {
		return fmt.Errorf("provision creation record %q action has unsupported typedAction %q", recordID, action.TypedAction)
	}
	if err := validateProvisionExecutionBinary(action.ActionID, action.CLIBinary); err != nil {
		return err
	}
	if len(action.RedactedArgv) == 0 {
		return fmt.Errorf("provision creation record %q action has no redactedArgv", recordID)
	}
	if _, err := validateRFC3339Date("provision creation action lastVerified", action.LastVerified); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	return nil
}

func validateProvisionCreationTeardown(recordID string, teardown provisionCreationTeardownRecord) error {
	if err := validateProvisionCreationTeardownIdentity(recordID, teardown); err != nil {
		return err
	}
	if teardown.Ready {
		return validateProvisionCreationReadyTeardown(recordID, teardown)
	}
	if len(teardown.MissingFields) == 0 {
		return fmt.Errorf("provision creation record %q teardown is not ready but has no missing fields", recordID)
	}
	return nil
}

func validateProvisionCreationTeardownIdentity(recordID string, teardown provisionCreationTeardownRecord) error {
	if teardown.ActionID == "" && len(teardown.MissingFields) == 0 {
		return fmt.Errorf("provision creation record %q teardown action is missing", recordID)
	}
	if teardown.ActionID != "" {
		if _, err := requirePlainField("provision creation teardown action id", teardown.ActionID, 1, 128); err != nil {
			return fmt.Errorf("provision creation record %q: %w", recordID, err)
		}
		if teardown.TypedAction != provisionActionDeleteRuntime {
			return fmt.Errorf("provision creation record %q teardown has typedAction %q, want %q", recordID, teardown.TypedAction, provisionActionDeleteRuntime)
		}
	}
	return nil
}

func validateProvisionCreationReadyTeardown(recordID string, teardown provisionCreationTeardownRecord) error {
	if teardown.CLIBinary == "" || len(teardown.RedactedArgv) == 0 {
		return fmt.Errorf("provision creation record %q ready teardown lacks argv", recordID)
	}
	if err := validateProvisionExecutionBinary(teardown.ActionID, teardown.CLIBinary); err != nil {
		return err
	}
	if _, err := validateRFC3339Date("provision creation teardown lastVerified", teardown.LastVerified); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	if teardown.RedactedArgv[0] != teardown.CLIBinary {
		return fmt.Errorf("provision creation record %q teardown argv does not start with cliBinary", recordID)
	}
	for _, token := range teardown.RedactedArgv {
		if err := validateProvisionExecutionCommandToken("provision creation teardown argv token", token); err != nil {
			return fmt.Errorf("provision creation record %q: %w", recordID, err)
		}
	}
	return nil
}

func validateProvisionCreationDiagnostic(recordID string, diagnostic provisionCreationDiagnostic) error {
	if err := validateProvisionCreationDiagnosticIdentity(recordID, diagnostic); err != nil {
		return err
	}
	if err := validateProvisionCreationDiagnosticStatus(recordID, diagnostic); err != nil {
		return err
	}
	if err := validateProvisionCreationDiagnosticArgv(recordID, diagnostic); err != nil {
		return err
	}
	return validateProvisionCreationDiagnosticSummary(recordID, diagnostic.Summary)
}

func validateProvisionCreationDiagnosticIdentity(recordID string, diagnostic provisionCreationDiagnostic) error {
	if _, err := requirePlainField("provision creation diagnostic action id", diagnostic.ActionID, 1, 128); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	if diagnostic.TypedAction != provisionActionDiagnoseCreation {
		return fmt.Errorf("provision creation record %q diagnostic has typedAction %q, want %q", recordID, diagnostic.TypedAction, provisionActionDiagnoseCreation)
	}
	return validateProvisionExecutionBinary(diagnostic.ActionID, diagnostic.CLIBinary)
}

func validateProvisionCreationDiagnosticStatus(recordID string, diagnostic provisionCreationDiagnostic) error {
	if _, err := validateRFC3339Date("provision creation diagnostic lastVerified", diagnostic.LastVerified); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	if diagnostic.Status != provisionCreationStatusSucceeded && diagnostic.Status != provisionCreationStatusFailed {
		return fmt.Errorf("provision creation record %q diagnostic has status %q, want succeeded or failed", recordID, diagnostic.Status)
	}
	if _, err := validateRFC3339NanoField("provision creation diagnostic checkedAt", diagnostic.CheckedAt); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	if diagnostic.ProviderOutputSHA256 == "" {
		return nil
	}
	if _, err := validateSHA256Hex("provision creation diagnostic providerOutputSha256", diagnostic.ProviderOutputSHA256); err != nil {
		return fmt.Errorf("provision creation record %q: %w", recordID, err)
	}
	return nil
}

func validateProvisionCreationDiagnosticArgv(recordID string, diagnostic provisionCreationDiagnostic) error {
	if len(diagnostic.RedactedArgv) == 0 {
		return fmt.Errorf("provision creation record %q diagnostic has no redactedArgv", recordID)
	}
	for _, token := range diagnostic.RedactedArgv {
		if err := validateProvisionExecutionCommandToken("provision creation diagnostic argv token", token); err != nil {
			return fmt.Errorf("provision creation record %q: %w", recordID, err)
		}
	}
	return nil
}

func validateProvisionCreationDiagnosticSummary(recordID string, summary []string) error {
	for _, line := range summary {
		if strings.TrimSpace(line) == "" {
			return fmt.Errorf("provision creation record %q diagnostic summary contains an empty line", recordID)
		}
		if containsControlCharacter(line) {
			return fmt.Errorf("provision creation record %q diagnostic summary contains control characters", recordID)
		}
	}
	return nil
}

func isSupportedProvisionCreationStatus(status provisionCreationStatus) bool {
	switch status {
	case provisionCreationStatusPending, provisionCreationStatusSucceeded, provisionCreationStatusFailed, provisionCreationStatusDeleted:
		return true
	default:
		return false
	}
}
