package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

//go:embed provision_execution_manifest.json
var provisionExecutionManifestJSON []byte

const provisionExecutionManifestSchemaVersion = 1

type provisionExecutionActionKind string

const (
	provisionActionProbeIdentity       provisionExecutionActionKind = "probe_identity"
	provisionActionResolveMachineTypes provisionExecutionActionKind = "resolve_machine_types"
	provisionActionDiagnoseCreation    provisionExecutionActionKind = "diagnose_creation"
	provisionActionCreateRuntime       provisionExecutionActionKind = "create_runtime"
	provisionActionDeleteRuntime       provisionExecutionActionKind = "delete_runtime"
)

type provisionExecutionManifest struct {
	SchemaVersion int                               `json:"schemaVersion"`
	Entries       []provisionExecutionManifestEntry `json:"entries"`
	entryByID     map[string]provisionExecutionManifestEntry
	entryByAction map[string]provisionExecutionManifestEntry
}

type provisionExecutionManifestEntry struct {
	ID                 string                       `json:"id"`
	Provider           string                       `json:"provider"`
	TypedAction        provisionExecutionActionKind `json:"typedAction"`
	Binary             string                       `json:"binary"`
	Mutating           bool                         `json:"mutating"`
	RequiresApproval   bool                         `json:"requiresApproval"`
	LastVerified       string                       `json:"lastVerified"`
	RequiredFields     []string                     `json:"requiredFields,omitempty"`
	RequiredFileInputs []string                     `json:"requiredFileInputs,omitempty"`
	Argv               []string                     `json:"argv"`
	TeardownActionID   string                       `json:"teardownActionId,omitempty"`
}

type provisionExecutionAction struct {
	Provider      string
	Kind          provisionExecutionActionKind
	RuntimeName   string
	InstanceType  string
	Region        string
	ImageSelector provisionCatalogImageSelector
	DiskGB        int
	StackName     string
	ResourceID    string
	FileInputs    []provisionExecutionFileInput
	SecretMarkers []string
}

type provisionExecutionFileInput struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Purpose   string `json:"purpose"`
	SizeBytes int64  `json:"sizeBytes"`
	SHA256    string `json:"sha256"`
	Sensitive bool   `json:"sensitive"`
}

type provisionExecutionPlan struct {
	ActionID         string                        `json:"actionId"`
	Provider         string                        `json:"provider"`
	TypedAction      provisionExecutionActionKind  `json:"typedAction"`
	CLIBinary        string                        `json:"cliBinary"`
	Argv             []string                      `json:"argv"`
	Mutating         bool                          `json:"mutating"`
	RequiresApproval bool                          `json:"requiresApproval"`
	SecretFree       bool                          `json:"secretFree"`
	LastVerified     string                        `json:"lastVerified"`
	FileInputs       []provisionExecutionFileInput `json:"fileInputs,omitempty"`
	TeardownActionID string                        `json:"teardownActionId,omitempty"`
}

var allowedProvisionExecutionFields = map[string]struct{}{
	"diskGB":       {},
	"image":        {},
	"instanceType": {},
	"region":       {},
	"resourceID":   {},
	"runtimeName":  {},
	"stackName":    {},
}

var forbiddenProvisionExecutionBinaries = map[string]struct{}{
	"bash":       {},
	"cmd":        {},
	"env":        {},
	"fish":       {},
	"osascript":  {},
	"powershell": {},
	"python":     {},
	"python3":    {},
	"sh":         {},
	"sudo":       {},
	"zsh":        {},
}

func loadProvisionExecutionManifest() (provisionExecutionManifest, error) {
	var manifest provisionExecutionManifest
	if err := json.Unmarshal(provisionExecutionManifestJSON, &manifest); err != nil {
		return provisionExecutionManifest{}, fmt.Errorf("parse provision execution manifest: %w", err)
	}
	if err := validateProvisionExecutionManifest(&manifest); err != nil {
		return provisionExecutionManifest{}, err
	}
	return manifest, nil
}

func validateProvisionExecutionManifest(manifest *provisionExecutionManifest) error {
	if manifest.SchemaVersion != provisionExecutionManifestSchemaVersion {
		return fmt.Errorf("provision execution manifest schemaVersion = %d, want %d", manifest.SchemaVersion, provisionExecutionManifestSchemaVersion)
	}
	if len(manifest.Entries) == 0 {
		return errors.New("provision execution manifest has no entries")
	}
	entryByID := make(map[string]provisionExecutionManifestEntry, len(manifest.Entries))
	entryByAction := make(map[string]provisionExecutionManifestEntry, len(manifest.Entries))
	for _, entry := range manifest.Entries {
		if err := validateProvisionExecutionManifestEntry(entry, entryByID, entryByAction); err != nil {
			return err
		}
		entryByID[entry.ID] = entry
		entryByAction[provisionExecutionActionKey(entry.Provider, entry.TypedAction)] = entry
	}
	for _, entry := range manifest.Entries {
		if entry.TeardownActionID == "" {
			continue
		}
		teardown, ok := entryByID[entry.TeardownActionID]
		if !ok {
			return fmt.Errorf("provision execution manifest entry %q references unknown teardown action %q", entry.ID, entry.TeardownActionID)
		}
		if teardown.Provider != entry.Provider || teardown.TypedAction != provisionActionDeleteRuntime {
			return fmt.Errorf("provision execution manifest entry %q teardown action %q is not a matching delete_runtime action", entry.ID, entry.TeardownActionID)
		}
	}
	manifest.entryByID = entryByID
	manifest.entryByAction = entryByAction
	return nil
}

func validateProvisionExecutionManifestEntry(entry provisionExecutionManifestEntry, existingByID map[string]provisionExecutionManifestEntry, existingByAction map[string]provisionExecutionManifestEntry) error {
	if err := validateProvisionExecutionManifestEntryIdentity(entry, existingByID); err != nil {
		return err
	}
	if err := validateProvisionExecutionManifestEntryAction(entry, existingByAction); err != nil {
		return err
	}
	if err := validateProvisionExecutionBinary(entry.ID, entry.Binary); err != nil {
		return err
	}
	if err := validateProvisionExecutionManifestEntryApproval(entry); err != nil {
		return err
	}
	if _, err := validateRFC3339Date("execution manifest lastVerified", entry.LastVerified); err != nil {
		return fmt.Errorf("provision execution manifest entry %q: %w", entry.ID, err)
	}
	if len(entry.Argv) == 0 {
		return fmt.Errorf("provision execution manifest entry %q has no argv", entry.ID)
	}
	if err := validateProvisionExecutionManifestFields(entry); err != nil {
		return err
	}
	return validateProvisionExecutionManifestArgv(entry)
}

func validateProvisionExecutionManifestEntryIdentity(entry provisionExecutionManifestEntry, existingByID map[string]provisionExecutionManifestEntry) error {
	if _, err := requirePlainField("execution manifest entry id", entry.ID, 1, 128); err != nil {
		return err
	}
	if _, exists := existingByID[entry.ID]; exists {
		return fmt.Errorf("provision execution manifest duplicate entry %q", entry.ID)
	}
	if _, err := requirePlainField("execution manifest provider", entry.Provider, 1, 64); err != nil {
		return fmt.Errorf("provision execution manifest entry %q: %w", entry.ID, err)
	}
	return nil
}

func validateProvisionExecutionManifestEntryAction(entry provisionExecutionManifestEntry, existingByAction map[string]provisionExecutionManifestEntry) error {
	if !isSupportedProvisionExecutionAction(entry.TypedAction) {
		return fmt.Errorf("provision execution manifest entry %q has unsupported typedAction %q", entry.ID, entry.TypedAction)
	}
	actionKey := provisionExecutionActionKey(entry.Provider, entry.TypedAction)
	if existing, exists := existingByAction[actionKey]; exists {
		return fmt.Errorf("provision execution manifest entries %q and %q both implement %s", existing.ID, entry.ID, actionKey)
	}
	return nil
}

func validateProvisionExecutionManifestEntryApproval(entry provisionExecutionManifestEntry) error {
	if isMutatingProvisionAction(entry.TypedAction) {
		if !entry.Mutating {
			return fmt.Errorf("provision execution manifest entry %q implements mutating action %q but mutating is false", entry.ID, entry.TypedAction)
		}
		if !entry.RequiresApproval {
			return fmt.Errorf("provision execution manifest entry %q implements mutating action %q without requiresApproval", entry.ID, entry.TypedAction)
		}
	}
	if entry.Mutating && !entry.RequiresApproval {
		return fmt.Errorf("provision execution manifest entry %q is mutating without requiresApproval", entry.ID)
	}
	return nil
}

func validateProvisionExecutionBinary(entryID string, binary string) error {
	trimmed, err := requirePlainField("execution manifest binary", binary, 1, 64)
	if err != nil {
		return fmt.Errorf("provision execution manifest entry %q: %w", entryID, err)
	}
	if strings.Contains(trimmed, "/") || strings.Contains(trimmed, "\\") {
		return fmt.Errorf("provision execution manifest entry %q binary must be a provider CLI name, not a path", entryID)
	}
	if _, forbidden := forbiddenProvisionExecutionBinaries[trimmed]; forbidden {
		return fmt.Errorf("provision execution manifest entry %q uses forbidden command runner binary %q", entryID, trimmed)
	}
	return nil
}

func validateProvisionExecutionManifestFields(entry provisionExecutionManifestEntry) error {
	fieldSet := make(map[string]struct{}, len(entry.RequiredFields))
	for _, field := range entry.RequiredFields {
		if _, ok := allowedProvisionExecutionFields[field]; !ok {
			return fmt.Errorf("provision execution manifest entry %q requires unsupported field %q", entry.ID, field)
		}
		fieldSet[field] = struct{}{}
	}
	fileSet := make(map[string]struct{}, len(entry.RequiredFileInputs))
	for _, name := range entry.RequiredFileInputs {
		if _, err := requirePlainField("execution manifest file input", name, 1, 64); err != nil {
			return fmt.Errorf("provision execution manifest entry %q: %w", entry.ID, err)
		}
		fileSet[name] = struct{}{}
	}
	for _, template := range entry.Argv {
		placeholders, err := provisionExecutionArgPlaceholders(template)
		if err != nil {
			return fmt.Errorf("provision execution manifest entry %q argv template %q: %w", entry.ID, template, err)
		}
		for _, placeholder := range placeholders {
			if strings.HasPrefix(placeholder, "file:") {
				name := strings.TrimPrefix(placeholder, "file:")
				if _, ok := fileSet[name]; !ok {
					return fmt.Errorf("provision execution manifest entry %q argv references undeclared file input %q", entry.ID, name)
				}
				continue
			}
			if _, ok := fieldSet[placeholder]; !ok {
				return fmt.Errorf("provision execution manifest entry %q argv references undeclared field %q", entry.ID, placeholder)
			}
		}
	}
	return nil
}

func validateProvisionExecutionManifestArgv(entry provisionExecutionManifestEntry) error {
	for _, template := range entry.Argv {
		if strings.TrimSpace(template) == "" {
			return fmt.Errorf("provision execution manifest entry %q has an empty argv template", entry.ID)
		}
		if containsControlCharacter(template) {
			return fmt.Errorf("provision execution manifest entry %q argv template contains control characters", entry.ID)
		}
		if err := validateProvisionExecutionNoShellSyntax("execution manifest argv template", template); err != nil {
			return fmt.Errorf("provision execution manifest entry %q: %w", entry.ID, err)
		}
	}
	return nil
}

func buildProvisionExecutionPlan(action provisionExecutionAction) (provisionExecutionPlan, error) {
	manifest, err := loadProvisionExecutionManifest()
	if err != nil {
		return provisionExecutionPlan{}, err
	}
	return buildProvisionExecutionPlanFromManifest(manifest, action)
}

func buildProvisionExecutionPlanFromManifest(manifest provisionExecutionManifest, action provisionExecutionAction) (provisionExecutionPlan, error) {
	entry, ok := manifest.entryByAction[provisionExecutionActionKey(action.Provider, action.Kind)]
	if !ok {
		return provisionExecutionPlan{}, fmt.Errorf("no provision execution manifest entry for provider %q action %q", action.Provider, action.Kind)
	}
	fieldValues, err := provisionExecutionFieldValues(action, entry.RequiredFields)
	if err != nil {
		return provisionExecutionPlan{}, err
	}
	fileValues, err := provisionExecutionFileValues(action.FileInputs, entry.RequiredFileInputs)
	if err != nil {
		return provisionExecutionPlan{}, err
	}
	command := []string{entry.Binary}
	for _, template := range entry.Argv {
		arg, err := renderProvisionExecutionArg(template, fieldValues, fileValues)
		if err != nil {
			return provisionExecutionPlan{}, fmt.Errorf("render provision execution manifest entry %q argv: %w", entry.ID, err)
		}
		command = append(command, arg)
	}
	plan := provisionExecutionPlan{
		ActionID:         entry.ID,
		Provider:         entry.Provider,
		TypedAction:      entry.TypedAction,
		CLIBinary:        entry.Binary,
		Argv:             command,
		Mutating:         entry.Mutating,
		RequiresApproval: entry.RequiresApproval,
		SecretFree:       true,
		LastVerified:     entry.LastVerified,
		FileInputs:       orderedProvisionExecutionFileInputs(fileValues, entry.RequiredFileInputs),
		TeardownActionID: entry.TeardownActionID,
	}
	if err := validateProvisionExecutionPlan(plan, action.SecretMarkers); err != nil {
		return provisionExecutionPlan{}, err
	}
	return plan, nil
}

func provisionExecutionFieldValues(action provisionExecutionAction, required []string) (map[string]string, error) {
	values := make(map[string]string, len(required))
	for _, field := range required {
		value, err := provisionExecutionFieldValue(action, field)
		if err != nil {
			return nil, err
		}
		values[field] = value
	}
	return values, nil
}

func provisionExecutionFieldValue(action provisionExecutionAction, field string) (string, error) {
	switch field {
	case "diskGB":
		if action.DiskGB <= 0 {
			return "", errors.New("diskGB is required for provision execution")
		}
		return strconv.Itoa(action.DiskGB), nil
	case "image":
		return requirePlainField("image", action.ImageSelector.Value, 1, 256)
	case "instanceType":
		return requirePlainField("instance-type", action.InstanceType, 1, 128)
	case "region":
		return requirePlainField("region", action.Region, 1, 128)
	case "resourceID":
		return requirePlainField("resource-id", action.ResourceID, 1, 256)
	case "runtimeName":
		return validateCloudInitHostname(action.RuntimeName)
	case "stackName":
		stackName := action.StackName
		if stackName == "" && action.RuntimeName != "" {
			stackName = "setta-" + action.RuntimeName
		}
		return validateCloudFormationStackName(stackName)
	default:
		return "", fmt.Errorf("unsupported provision execution field %q", field)
	}
}

func provisionExecutionFileValues(inputs []provisionExecutionFileInput, required []string) (map[string]provisionExecutionFileInput, error) {
	values := make(map[string]provisionExecutionFileInput, len(inputs))
	for _, input := range inputs {
		normalized, err := normalizeProvisionExecutionFileInput(input)
		if err != nil {
			return nil, err
		}
		if _, exists := values[normalized.Name]; exists {
			return nil, fmt.Errorf("duplicate provision execution file input %q", normalized.Name)
		}
		values[normalized.Name] = normalized
	}
	for _, name := range required {
		if _, ok := values[name]; !ok {
			return nil, fmt.Errorf("missing provision execution file input %q", name)
		}
	}
	return values, nil
}

func normalizeProvisionExecutionFileInput(input provisionExecutionFileInput) (provisionExecutionFileInput, error) {
	name, err := requirePlainField("file input name", input.Name, 1, 64)
	if err != nil {
		return provisionExecutionFileInput{}, err
	}
	path := strings.TrimSpace(input.Path)
	if err := validateAbsoluteNoSpacePath("file input path", path); err != nil {
		return provisionExecutionFileInput{}, err
	}
	purpose := strings.TrimSpace(input.Purpose)
	if purpose == "" {
		return provisionExecutionFileInput{}, fmt.Errorf("file input %q purpose is required", name)
	}
	if containsControlCharacter(purpose) {
		return provisionExecutionFileInput{}, fmt.Errorf("file input %q purpose must not contain control characters", name)
	}
	if input.SizeBytes <= 0 {
		return provisionExecutionFileInput{}, fmt.Errorf("file input %q sizeBytes must be positive", name)
	}
	digest, err := validateSHA256Hex("file input "+name+" sha256", input.SHA256)
	if err != nil {
		return provisionExecutionFileInput{}, err
	}
	input.Name = name
	input.Path = path
	input.Purpose = purpose
	input.SHA256 = digest
	return input, nil
}

func orderedProvisionExecutionFileInputs(values map[string]provisionExecutionFileInput, order []string) []provisionExecutionFileInput {
	ordered := make([]provisionExecutionFileInput, 0, len(order))
	for _, name := range order {
		ordered = append(ordered, values[name])
	}
	return ordered
}

func renderProvisionExecutionArg(template string, fields map[string]string, files map[string]provisionExecutionFileInput) (string, error) {
	var builder strings.Builder
	remaining := template
	for {
		start := strings.Index(remaining, "{{")
		if start < 0 {
			builder.WriteString(remaining)
			break
		}
		builder.WriteString(remaining[:start])
		afterStart := remaining[start+2:]
		end := strings.Index(afterStart, "}}")
		if end < 0 {
			return "", fmt.Errorf("unterminated placeholder in %q", template)
		}
		placeholder := afterStart[:end]
		value, err := provisionExecutionPlaceholderValue(placeholder, fields, files)
		if err != nil {
			return "", err
		}
		builder.WriteString(value)
		remaining = afterStart[end+2:]
	}
	arg := builder.String()
	if strings.TrimSpace(arg) == "" {
		return "", fmt.Errorf("rendered empty argv token from %q", template)
	}
	if err := validateProvisionExecutionCommandToken("rendered argv token", arg); err != nil {
		return "", err
	}
	return arg, nil
}

func provisionExecutionPlaceholderValue(placeholder string, fields map[string]string, files map[string]provisionExecutionFileInput) (string, error) {
	if placeholder == "" {
		return "", errors.New("empty placeholder")
	}
	if strings.HasPrefix(placeholder, "file:") {
		name := strings.TrimPrefix(placeholder, "file:")
		input, ok := files[name]
		if !ok {
			return "", fmt.Errorf("unknown file input placeholder %q", name)
		}
		return input.Path, nil
	}
	value, ok := fields[placeholder]
	if !ok {
		return "", fmt.Errorf("unknown field placeholder %q", placeholder)
	}
	return value, nil
}

func provisionExecutionArgPlaceholders(template string) ([]string, error) {
	placeholders := make([]string, 0)
	remaining := template
	for {
		start := strings.Index(remaining, "{{")
		if start < 0 {
			if strings.Contains(remaining, "}}") {
				return nil, fmt.Errorf("unmatched placeholder close in %q", template)
			}
			break
		}
		if strings.Contains(remaining[:start], "}}") {
			return nil, fmt.Errorf("unmatched placeholder close in %q", template)
		}
		afterStart := remaining[start+2:]
		end := strings.Index(afterStart, "}}")
		if end < 0 {
			return nil, fmt.Errorf("unterminated placeholder in %q", template)
		}
		placeholder := afterStart[:end]
		if placeholder == "" {
			return nil, errors.New("empty placeholder")
		}
		if strings.Contains(placeholder, "{{") || strings.Contains(placeholder, "}}") {
			return nil, fmt.Errorf("nested placeholder %q", placeholder)
		}
		placeholders = append(placeholders, placeholder)
		remaining = afterStart[end+2:]
	}
	return placeholders, nil
}

func validateProvisionExecutionPlan(plan provisionExecutionPlan, secretMarkers []string) error {
	if len(plan.Argv) == 0 {
		return errors.New("provision execution plan has no argv")
	}
	if plan.Argv[0] != plan.CLIBinary {
		return errors.New("provision execution plan argv does not start with cliBinary")
	}
	if err := validateProvisionExecutionBinary(plan.ActionID, plan.CLIBinary); err != nil {
		return err
	}
	if plan.Mutating && !plan.RequiresApproval {
		return fmt.Errorf("provision execution plan %q is mutating without approval", plan.ActionID)
	}
	for _, token := range plan.Argv {
		if err := validateProvisionExecutionCommandToken("provision execution argv token", token); err != nil {
			return fmt.Errorf("provision execution plan %q: %w", plan.ActionID, err)
		}
		for _, marker := range secretMarkers {
			if marker == "" {
				continue
			}
			if strings.Contains(token, marker) {
				return fmt.Errorf("provision execution plan %q argv contains a sensitive marker", plan.ActionID)
			}
		}
	}
	return nil
}

func validateProvisionExecutionCommandToken(label string, token string) error {
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("%s is empty", label)
	}
	if containsControlCharacter(token) {
		return fmt.Errorf("%s contains control characters", label)
	}
	return validateProvisionExecutionNoShellSyntax(label, token)
}

func validateProvisionExecutionNoShellSyntax(label string, value string) error {
	for _, forbidden := range []string{"&&", "||", "$(", "${", "`", "|", ">", "<", ";"} {
		if strings.Contains(value, forbidden) {
			return fmt.Errorf("%s contains forbidden shell syntax %q", label, forbidden)
		}
	}
	return nil
}

func provisionExecutionActionKey(provider string, action provisionExecutionActionKind) string {
	return provider + "/" + string(action)
}

func isSupportedProvisionExecutionAction(action provisionExecutionActionKind) bool {
	switch action {
	case provisionActionProbeIdentity, provisionActionResolveMachineTypes, provisionActionDiagnoseCreation, provisionActionCreateRuntime, provisionActionDeleteRuntime:
		return true
	default:
		return false
	}
}

func isMutatingProvisionAction(action provisionExecutionActionKind) bool {
	switch action {
	case provisionActionCreateRuntime, provisionActionDeleteRuntime:
		return true
	default:
		return false
	}
}

func validateRFC3339Date(label string, value string) (string, error) {
	trimmed, err := requirePlainField(label, value, 10, 10)
	if err != nil {
		return "", err
	}
	_, err = validateRFC3339NanoField(label, trimmed+"T00:00:00Z")
	if err != nil {
		return "", err
	}
	return trimmed, nil
}
