package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestProvisionRenderLinkAWSQuickCreateOmitsSecretsAndMarksNoEcho(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout

	code := runWithDeps(append([]string{"provision", "render-link"}, provisionRenderLinkArgs()...), deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionRenderLinkResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse render-link JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || result.Provider != "aws" || result.Region != "us-east-1" {
		t.Fatalf("result header = %+v", result)
	}
	if result.Resolution.InstanceType != "t3.xlarge" || result.Resolution.DiskGB != 96 {
		t.Fatalf("resolution = %+v", result.Resolution)
	}
	if !result.SecretFreeQuickCreateURL {
		t.Fatalf("quick-create URL not marked secret-free: %s", result.QuickCreateURL)
	}
	query := quickCreateFragmentQuery(t, result.QuickCreateURL)
	if query.Get("templateURL") != "https://downloads.example.test/setta/v1.2.3/setta-runtime-aws-cloudformation.yaml" {
		t.Fatalf("templateURL = %q", query.Get("templateURL"))
	}
	if query.Get("stackName") != "setta-setta-test-runtime" {
		t.Fatalf("stackName = %q", query.Get("stackName"))
	}
	if query.Get("param_RuntimeName") != "setta-test-runtime" ||
		query.Get("param_InstanceType") != "t3.xlarge" ||
		query.Get("param_DiskGB") != "96" ||
		query.Get("param_ProvisionId") != "provision_test_012345" ||
		query.Get("param_ProvisionExpiresAt") != "2026-07-07T10:00:00Z" {
		t.Fatalf("prefilled query = %v", query)
	}
	for _, secretParam := range []string{"TailscaleAuthKey", "PairingTokenHash", "ProvisionAttestationKey"} {
		if query.Has("param_"+secretParam) || strings.Contains(result.QuickCreateURL, secretParam) {
			t.Fatalf("quick-create URL includes secret parameter %s: %s", secretParam, result.QuickCreateURL)
		}
	}
	assertManualParameterNoEcho(t, result.ManualParameters, "TailscaleAuthKey")
	assertManualParameterNoEcho(t, result.ManualParameters, "PairingTokenHash")
	assertManualParameterNoEcho(t, result.ManualParameters, "ProvisionAttestationKey")
	assertAWSCloudFormationTemplate(t, result.Template)
}

func TestProvisionRenderLinkAWSQuickCreatePrefillsPlacement(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout

	args := append(provisionRenderLinkArgs(),
		"--vpc-id", "vpc-explicit123",
		"--subnet-id", "subnet-explicit123",
		"--aws-security-group-id", "sg-explicit123",
	)
	code := runWithDeps(append([]string{"provision", "render-link"}, args...), deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionRenderLinkResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse render-link JSON: %v\n%s", err, stdout.String())
	}
	query := quickCreateFragmentQuery(t, result.QuickCreateURL)
	if query.Get("param_VpcId") != "vpc-explicit123" ||
		query.Get("param_SubnetId") != "subnet-explicit123" ||
		query.Get("param_SecurityGroupId") != "sg-explicit123" {
		t.Fatalf("placement query = %v", query)
	}
	if result.Resolution.AWSPlacement == nil ||
		result.Resolution.AWSPlacement.VPCID != "vpc-explicit123" ||
		result.Resolution.AWSPlacement.SubnetID != "subnet-explicit123" ||
		result.Resolution.AWSPlacement.SecurityGroupID != "sg-explicit123" ||
		result.Resolution.AWSPlacement.SecurityGroupMode != "existing" {
		t.Fatalf("aws placement = %+v", result.Resolution.AWSPlacement)
	}
	for _, required := range []string{
		"SecurityGroupId:\n    Type: String",
		"HasSecurityGroupId: !Not [!Equals [!Ref SecurityGroupId, '']]",
		"CreateRuntimeSecurityGroup: !Equals [!Ref SecurityGroupId, '']",
		"Condition: CreateRuntimeSecurityGroup",
		"!If [HasSecurityGroupId, !Ref SecurityGroupId, !Ref RuntimeSecurityGroup]",
	} {
		if !strings.Contains(result.Template, required) {
			t.Fatalf("template missing %q:\n%s", required, result.Template)
		}
	}
}

func TestProvisionRenderLinkRejectsUnsupportedProvider(t *testing.T) {
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stderr = &stderr

	code := runWithDeps([]string{"provision", "render-link", "--json", "--provider", "gcp"}, deps)
	if code != 2 {
		t.Fatalf("exit code = %d, want usage failure", code)
	}
	if !strings.Contains(stderr.String(), `only supports provider "aws"`) {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestProvisionExecutionManifestBuildsHetznerCreatePlan(t *testing.T) {
	plan, err := buildProvisionExecutionPlan(provisionExecutionAction{
		Provider:     "hetzner",
		Kind:         provisionActionCreateRuntime,
		RuntimeName:  "setta-test-runtime",
		InstanceType: "cx42",
		Region:       "fsn1",
		ImageSelector: provisionCatalogImageSelector{
			Kind:  "image_alias",
			Value: "ubuntu-24.04",
		},
		FileInputs: []provisionExecutionFileInput{
			provisionExecutionTestFileInput("cloudInit", "/tmp/setta-cloud-init.yaml"),
		},
		SecretMarkers: []string{"tskey-auth-secret", "pairing-token-secret"},
	})
	if err != nil {
		t.Fatalf("build execution plan: %v", err)
	}
	wantArgv := []string{
		"hcloud",
		"server",
		"create",
		"--name",
		"setta-test-runtime",
		"--type",
		"cx42",
		"--image",
		"ubuntu-24.04",
		"--location",
		"fsn1",
		"--user-data-from-file",
		"/tmp/setta-cloud-init.yaml",
		"--label",
		"setta:runtime=true",
		"--label",
		"setta:runtime_name=setta-test-runtime",
		"--label",
		"setta:created_by=user",
		"-o",
		"json",
	}
	if !reflect.DeepEqual(plan.Argv, wantArgv) {
		t.Fatalf("argv = %#v, want %#v", plan.Argv, wantArgv)
	}
	if plan.ActionID != "hetzner.server.create_runtime" ||
		plan.TeardownActionID != "hetzner.server.delete_runtime" ||
		!plan.Mutating ||
		!plan.RequiresApproval ||
		!plan.SecretFree {
		t.Fatalf("plan metadata = %+v", plan)
	}
	if len(plan.FileInputs) != 1 || plan.FileInputs[0].Name != "cloudInit" || !plan.FileInputs[0].Sensitive {
		t.Fatalf("file inputs = %+v", plan.FileInputs)
	}
}

func TestProvisionExecutionManifestBuildsAWSCreateStackPlan(t *testing.T) {
	plan, err := buildProvisionExecutionPlan(provisionExecutionAction{
		Provider:    "aws",
		Kind:        provisionActionCreateRuntime,
		RuntimeName: "setta-test-runtime",
		Region:      "us-east-1",
		FileInputs: []provisionExecutionFileInput{
			provisionExecutionTestFileInput("cloudFormationTemplate", "/tmp/setta-template.yaml"),
			provisionExecutionTestFileInput("cloudFormationParameters", "/tmp/setta-parameters.json"),
		},
		SecretMarkers: []string{"tskey-auth-secret", "attestation-secret"},
	})
	if err != nil {
		t.Fatalf("build execution plan: %v", err)
	}
	wantArgv := []string{
		"aws",
		"cloudformation",
		"create-stack",
		"--stack-name",
		"setta-setta-test-runtime",
		"--region",
		"us-east-1",
		"--template-body",
		"file:///tmp/setta-template.yaml",
		"--parameters",
		"file:///tmp/setta-parameters.json",
		"--tags",
		"Key=setta:runtime,Value=true",
		"Key=setta:runtime_name,Value=setta-test-runtime",
		"Key=setta:created_by,Value=user",
		"--output",
		"json",
	}
	if !reflect.DeepEqual(plan.Argv, wantArgv) {
		t.Fatalf("argv = %#v, want %#v", plan.Argv, wantArgv)
	}
	if plan.ActionID != "aws.cloudformation.create_runtime" || plan.TeardownActionID != "aws.cloudformation.delete_runtime" {
		t.Fatalf("plan metadata = %+v", plan)
	}
	if len(plan.FileInputs) != 2 {
		t.Fatalf("file inputs = %+v", plan.FileInputs)
	}
}

func TestProvisionExecutionManifestBuildsAWSDiagnosePlan(t *testing.T) {
	plan, err := buildProvisionExecutionPlan(provisionExecutionAction{
		Provider:  "aws",
		Kind:      provisionActionDiagnoseCreation,
		Region:    "us-east-1",
		StackName: "setta-setta-test-runtime",
	})
	if err != nil {
		t.Fatalf("build execution plan: %v", err)
	}
	wantArgv := []string{
		"aws",
		"cloudformation",
		"describe-stack-events",
		"--stack-name",
		"setta-setta-test-runtime",
		"--region",
		"us-east-1",
		"--max-items",
		"20",
		"--output",
		"json",
	}
	if !reflect.DeepEqual(plan.Argv, wantArgv) {
		t.Fatalf("argv = %#v, want %#v", plan.Argv, wantArgv)
	}
	if plan.ActionID != "aws.cloudformation.diagnose_creation" ||
		plan.Mutating ||
		plan.RequiresApproval ||
		!plan.SecretFree {
		t.Fatalf("plan metadata = %+v", plan)
	}
}

func TestProvisionExecutionManifestRejectsShellRunnerShape(t *testing.T) {
	manifest := provisionExecutionManifest{
		SchemaVersion: provisionExecutionManifestSchemaVersion,
		Entries: []provisionExecutionManifestEntry{
			{
				ID:               "aws.bad.create",
				Provider:         "aws",
				TypedAction:      provisionActionCreateRuntime,
				Binary:           "sh",
				Mutating:         true,
				RequiresApproval: true,
				LastVerified:     "2026-07-07",
				RequiredFields:   []string{"runtimeName"},
				Argv:             []string{"-c", "aws cloudformation create-stack"},
			},
		},
	}
	err := validateProvisionExecutionManifest(&manifest)
	if err == nil || !strings.Contains(err.Error(), `forbidden command runner binary "sh"`) {
		t.Fatalf("error = %v, want shell runner rejection", err)
	}
}

func TestProvisionExecutionManifestRejectsUndeclaredPlaceholders(t *testing.T) {
	manifest := provisionExecutionManifest{
		SchemaVersion: provisionExecutionManifestSchemaVersion,
		Entries: []provisionExecutionManifestEntry{
			{
				ID:               "aws.bad.create",
				Provider:         "aws",
				TypedAction:      provisionActionCreateRuntime,
				Binary:           "aws",
				Mutating:         true,
				RequiresApproval: true,
				LastVerified:     "2026-07-07",
				RequiredFields:   []string{"runtimeName"},
				Argv:             []string{"cloudformation", "create-stack", "{{stackName}}"},
			},
		},
	}
	err := validateProvisionExecutionManifest(&manifest)
	if err == nil || !strings.Contains(err.Error(), `references undeclared field "stackName"`) {
		t.Fatalf("error = %v, want undeclared placeholder rejection", err)
	}
}

func TestProvisionExecutionPlanRejectsSecretMarkersInArgv(t *testing.T) {
	_, err := buildProvisionExecutionPlan(provisionExecutionAction{
		Provider:      "hetzner",
		Kind:          provisionActionCreateRuntime,
		RuntimeName:   "setta-test-runtime",
		InstanceType:  "cx42",
		Region:        "fsn1",
		ImageSelector: provisionCatalogImageSelector{Value: "ubuntu-24.04"},
		FileInputs: []provisionExecutionFileInput{
			provisionExecutionTestFileInput("cloudInit", "/tmp/setta-cloud-init.yaml"),
		},
		SecretMarkers: []string{"cx42"},
	})
	if err == nil || !strings.Contains(err.Error(), "argv contains a sensitive marker") {
		t.Fatalf("error = %v, want sensitive marker rejection", err)
	}
}

func TestProvisionUpPlanOnlyEmitsAllowlistedCreatePlan(t *testing.T) {
	cloudInit := "#cloud-config\nruncmd:\n  - [ /bin/true ]\n"
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", cloudInit, 0o600)
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout

	code := runWithDeps([]string{
		"provision", "up",
		"--json",
		"--plan-only",
		"--provider", "hetzner",
		"--runtime-name", "setta-test-runtime",
		"--shape", "dev-standard",
		"--region", "fsn1",
		"--cloud-init-file", cloudInitPath,
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionUpResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse up JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || result.Mode != "plan_only" || result.Provider != "hetzner" {
		t.Fatalf("result = %+v", result)
	}
	plan := result.Plan
	if plan.ActionID != "hetzner.server.create_runtime" || !plan.RequiresApproval || !plan.SecretFree {
		t.Fatalf("plan = %+v", plan)
	}
	if len(plan.FileInputs) != 1 || plan.FileInputs[0].SHA256 != sha256Hex([]byte(cloudInit)) {
		t.Fatalf("file inputs = %+v", plan.FileInputs)
	}
	if !containsString(plan.Argv, cloudInitPath) {
		t.Fatalf("argv = %#v, want cloud-init file path %s", plan.Argv, cloudInitPath)
	}
}

func TestProvisionUpPlanOnlyRequiresRestrictiveSecretFilePermissions(t *testing.T) {
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", "#cloud-config\n", 0o644)
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stderr = &stderr

	code := runWithDeps([]string{
		"provision", "up",
		"--json",
		"--plan-only",
		"--provider", "hetzner",
		"--runtime-name", "setta-test-runtime",
		"--shape", "dev-standard",
		"--region", "fsn1",
		"--cloud-init-file", cloudInitPath,
	}, deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want runtime failure", code)
	}
	if !strings.Contains(stderr.String(), "must not be readable or writable by group/other") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestProvisionUpWithoutApprovalRefusesMutation(t *testing.T) {
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stderr = &stderr

	code := runWithDeps([]string{
		"provision", "up",
		"--json",
		"--provider", "hetzner",
		"--runtime-name", "setta-test-runtime",
	}, deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want runtime failure", code)
	}
	if !strings.Contains(stderr.String(), "requires --approve") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestProvisionUpApprovedWritesPendingRecordBeforeProviderCommand(t *testing.T) {
	appDataDir := t.TempDir()
	cloudInit := "#cloud-config\nruncmd:\n  - [ /bin/true ]\n"
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", cloudInit, 0o600)
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = expectHcloudLookPath(t)
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		assertHcloudCreateCommand(t, name, args, cloudInitPath)
		assertPendingCreationBeforeProviderCommand(t, appDataDir, deps, cloudInitPath, cloudInit)
		return []byte(`{"server":{"id":12345}}`), nil
	}

	code := runWithDeps(provisionUpApprovedHetznerArgs(appDataDir, cloudInitPath), deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionUpResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse up JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || result.Mode != "executed" || result.Execution == nil || result.Execution.ResourceID != "12345" {
		t.Fatalf("result = %+v", result)
	}
	registry, err := newProvisionCreationStore(appDataDir, deps).read()
	if err != nil {
		t.Fatalf("read creation registry: %v", err)
	}
	record, ok := provisionCreationRecordByID(registry, "hetzner:setta-test-runtime")
	if !ok {
		t.Fatalf("creation record missing after command: %+v", registry)
	}
	if record.Status != provisionCreationStatusSucceeded || record.ResourceID != "12345" {
		t.Fatalf("record status/resource = %+v", record)
	}
	if !record.TeardownAction.Ready || !reflect.DeepEqual(record.TeardownAction.RedactedArgv, []string{"hcloud", "server", "delete", "12345"}) {
		t.Fatalf("teardown action = %+v", record.TeardownAction)
	}
	if record.ProviderOutputSHA256 != sha256Hex([]byte(`{"server":{"id":12345}}`)) {
		t.Fatalf("provider output digest = %q", record.ProviderOutputSHA256)
	}
}

func TestProvisionUpApprovedUpdatesFailedRecordAndReturnsProviderOutput(t *testing.T) {
	appDataDir := t.TempDir()
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", "#cloud-config\n", 0o600)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.stderr = &stderr
	deps.lookPath = expectHcloudLookPath(t)
	deps.commandRunner = func(context.Context, string, ...string) ([]byte, error) {
		return []byte("quota exceeded\n"), errors.New("exit status 1")
	}

	code := runWithDeps(provisionUpApprovedHetznerArgs(appDataDir, cloudInitPath), deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want provider failure", code)
	}
	var result provisionUpResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse failed up JSON: %v\nstdout=%s\nstderr=%s", err, stdout.String(), stderr.String())
	}
	if result.OK || result.Execution == nil || result.Execution.ProviderOutput != "quota exceeded" {
		t.Fatalf("failed result = %+v", result)
	}
	registry, err := newProvisionCreationStore(appDataDir, deps).read()
	if err != nil {
		t.Fatalf("read creation registry: %v", err)
	}
	record, ok := provisionCreationRecordByID(registry, "hetzner:setta-test-runtime")
	if !ok {
		t.Fatalf("creation record missing after failure: %+v", registry)
	}
	if record.Status != provisionCreationStatusFailed || !strings.Contains(record.LastError, "exit status 1") {
		t.Fatalf("failed record = %+v", record)
	}
	if record.ProviderOutputSHA256 != sha256Hex([]byte("quota exceeded\n")) {
		t.Fatalf("provider output digest = %q", record.ProviderOutputSHA256)
	}
}

func TestProvisionInspectReportsExistingRecordWithNextActions(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	existing := writeSucceededHetznerCreationRecord(t, appDataDir, deps)
	var stdout bytes.Buffer
	deps.stdout = &stdout

	code := runWithDeps([]string{
		"provision", "inspect",
		"--json",
		"--app-data-dir", appDataDir,
		"--provider", "hetzner",
		"--runtime-name", "setta-test-runtime",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionInspectResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse inspect JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || !result.Exists || result.RecordID != existing.RecordID || result.CreationRecord == nil {
		t.Fatalf("inspect result = %+v", result)
	}
	if got := provisionNextActionIDs(result.NextActions); !reflect.DeepEqual(got, []string{
		"inspect_existing_record",
		"adopt_existing_runtime",
		"tear_down_existing_resource",
		"use_different_runtime_name",
	}) {
		t.Fatalf("next action ids = %#v", got)
	}
}

func TestProvisionUpApprovedExistingRecordReturnsStructuredResultWithoutProviderCommand(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	existing := writeSucceededHetznerCreationRecord(t, appDataDir, deps)
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", "#cloud-config\n", 0o600)
	var stdout bytes.Buffer
	deps.stdout = &stdout
	deps.lookPath = func(string) (string, error) {
		t.Fatal("provider CLI lookup should not run when an existing record blocks creation")
		return "", nil
	}
	deps.commandRunner = func(context.Context, string, ...string) ([]byte, error) {
		t.Fatal("provider command should not run when an existing record blocks creation")
		return nil, nil
	}

	code := runWithDeps(provisionUpApprovedHetznerArgs(appDataDir, cloudInitPath), deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want structured non-mutating result", code)
	}
	var result provisionUpResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse up JSON: %v\n%s", err, stdout.String())
	}
	if result.OK || result.Mode != "existing_record" || result.CreationRecord == nil {
		t.Fatalf("duplicate up result = %+v", result)
	}
	if result.CreationRecord.RecordID != existing.RecordID || result.CreationRecord.Status != provisionCreationStatusSucceeded {
		t.Fatalf("creation record = %+v, want existing %+v", result.CreationRecord, existing)
	}
	if got := provisionNextActionIDs(result.NextActions); !reflect.DeepEqual(got, []string{
		"inspect_existing_record",
		"adopt_existing_runtime",
		"tear_down_existing_resource",
		"use_different_runtime_name",
	}) {
		t.Fatalf("next action ids = %#v", got)
	}
}

func TestProvisionDiagnoseAWSUpdatesRecordWithStackFailureSummary(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	record := writeSucceededAWSCreationRecord(t, appDataDir, deps)
	var stdout bytes.Buffer
	deps.stdout = &stdout
	deps.lookPath = expectAWSLookPath(t)
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		assertAWSDiagnoseCommand(t, name, args)
		return []byte(`{
			"StackEvents": [
				{
					"LogicalResourceId": "SettaInstance",
					"ResourceStatus": "CREATE_FAILED",
					"ResourceStatusReason": "The requested configuration is currently not supported."
				},
				{
					"LogicalResourceId": "setta-setta-test-runtime",
					"ResourceStatus": "ROLLBACK_IN_PROGRESS",
					"ResourceStatusReason": "The following resource(s) failed to create: [SettaInstance]."
				}
			]
		}`), nil
	}

	code := runWithDeps([]string{
		"provision", "diagnose",
		"--json",
		"--app-data-dir", appDataDir,
		"--record-id", record.RecordID,
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionDiagnoseResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse diagnose JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || result.Diagnostic == nil || result.Execution == nil {
		t.Fatalf("result = %+v", result)
	}
	if !strings.Contains(result.Execution.ProviderOutput, "CREATE_FAILED") {
		t.Fatalf("execution provider output = %q", result.Execution.ProviderOutput)
	}
	wantSummary := []string{
		"SettaInstance: CREATE_FAILED: The requested configuration is currently not supported.",
		"setta-setta-test-runtime: ROLLBACK_IN_PROGRESS: The following resource(s) failed to create: [SettaInstance].",
	}
	if !reflect.DeepEqual(result.Diagnostic.Summary, wantSummary) {
		t.Fatalf("diagnostic summary = %#v, want %#v", result.Diagnostic.Summary, wantSummary)
	}
	updated := readProvisionCreationRecordForTest(t, appDataDir, deps, record.RecordID)
	if len(updated.ProviderDiagnostics) != 1 {
		t.Fatalf("provider diagnostics = %+v", updated.ProviderDiagnostics)
	}
	diagnostic := updated.ProviderDiagnostics[0]
	if diagnostic.ActionID != "aws.cloudformation.diagnose_creation" ||
		diagnostic.ProviderOutputSHA256 == "" ||
		diagnostic.Status != provisionCreationStatusSucceeded ||
		!reflect.DeepEqual(diagnostic.Summary, wantSummary) {
		t.Fatalf("stored diagnostic = %+v", diagnostic)
	}
	if strings.Contains(strings.Join(diagnostic.RedactedArgv, " "), "TailscaleAuthKey") {
		t.Fatalf("diagnostic argv leaked secret parameter: %#v", diagnostic.RedactedArgv)
	}
}

func TestProvisionDiagnoseHetznerRequiresKnownResourceID(t *testing.T) {
	appDataDir := t.TempDir()
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", "#cloud-config\n", 0o600)
	deps := testDeps()
	options := provisionUpOptions{
		Provider:      "hetzner",
		RuntimeName:   "setta-test-runtime",
		Shape:         "dev-standard",
		Region:        "fsn1",
		InstanceType:  "cx42",
		DiskGB:        96,
		CloudInitFile: cloudInitPath,
	}
	plan, err := planProvisionUp(options)
	if err != nil {
		t.Fatalf("plan provision up: %v", err)
	}
	record, err := newProvisionCreationRecord(options, plan, deps.now().UTC())
	if err != nil {
		t.Fatalf("new creation record: %v", err)
	}
	record = record.withExecutionResult(provisionExecutionRunResult{
		Status: provisionCreationStatusFailed,
		Error:  "quota exceeded",
	}, deps.now().UTC())
	if err := newProvisionCreationStore(appDataDir, deps).write(provisionCreationRegistry{
		Creations: []provisionCreationRecord{record},
	}); err != nil {
		t.Fatalf("write creation record: %v", err)
	}
	var stderr bytes.Buffer
	deps.stderr = &stderr

	code := runWithDeps([]string{
		"provision", "diagnose",
		"--json",
		"--app-data-dir", appDataDir,
		"--record-id", record.RecordID,
	}, deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want runtime failure", code)
	}
	if !strings.Contains(stderr.String(), "cannot be diagnosed by hcloud until resourceId is known") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestProvisionDownWithoutApprovalRefusesMutation(t *testing.T) {
	var stderr bytes.Buffer
	deps := testDeps()
	deps.stderr = &stderr

	code := runWithDeps([]string{
		"provision", "down",
		"--json",
		"--runtime-name", "setta-test-runtime",
	}, deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want runtime failure", code)
	}
	if !strings.Contains(stderr.String(), "requires --approve") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestProvisionDownPlanOnlyEmitsStoredTeardownPlan(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	record := writeSucceededHetznerCreationRecord(t, appDataDir, deps)
	var stdout bytes.Buffer
	deps.stdout = &stdout

	code := runWithDeps([]string{
		"provision", "down",
		"--json",
		"--plan-only",
		"--app-data-dir", appDataDir,
		"--record-id", record.RecordID,
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionDownResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse down JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || result.Mode != "plan_only" || result.RecordID != "hetzner:setta-test-runtime" {
		t.Fatalf("result = %+v", result)
	}
	if result.Plan.ActionID != "hetzner.server.delete_runtime" || !reflect.DeepEqual(result.Plan.Argv, []string{"hcloud", "server", "delete", "12345"}) {
		t.Fatalf("plan = %+v", result.Plan)
	}
	if result.CreationRecord == nil || result.CreationRecord.TeardownAction.ActionID != "hetzner.server.delete_runtime" {
		t.Fatalf("creation record = %+v", result.CreationRecord)
	}
}

func TestProvisionDownApprovedExecutesStoredTeardownAndMarksDeleted(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	writeSucceededHetznerCreationRecord(t, appDataDir, deps)
	var stdout bytes.Buffer
	deps.stdout = &stdout
	deps.lookPath = expectHcloudLookPath(t)
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		assertHcloudDeleteCommand(t, name, args)
		return []byte("deleted\n"), nil
	}

	code := runWithDeps([]string{
		"provision", "down",
		"--json",
		"--approve",
		"--app-data-dir", appDataDir,
		"--provider", "hetzner",
		"--runtime-name", "setta-test-runtime",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionDownResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse down JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK || result.Mode != "executed" || result.Execution == nil || result.Execution.Status != provisionCreationStatusSucceeded {
		t.Fatalf("result = %+v", result)
	}
	record := readProvisionCreationRecordForTest(t, appDataDir, deps, "hetzner:setta-test-runtime")
	if record.Status != provisionCreationStatusDeleted || record.DeletedAt == "" || record.LastError != "" {
		t.Fatalf("record after down = %+v", record)
	}
	if record.TeardownOutputSHA256 != sha256Hex([]byte("deleted\n")) {
		t.Fatalf("teardown output digest = %q", record.TeardownOutputSHA256)
	}
}

func TestProvisionDownRejectsTamperedStoredTeardownArgv(t *testing.T) {
	appDataDir := t.TempDir()
	deps := testDeps()
	record := writeSucceededHetznerCreationRecord(t, appDataDir, deps)
	record.TeardownAction.RedactedArgv = []string{"hcloud", "server", "delete", "99999"}
	if err := newProvisionCreationStore(appDataDir, deps).update(record); err != nil {
		t.Fatalf("update tampered record: %v", err)
	}
	var stderr bytes.Buffer
	deps.stderr = &stderr
	deps.lookPath = expectHcloudLookPath(t)
	deps.commandRunner = func(context.Context, string, ...string) ([]byte, error) {
		t.Fatal("teardown command should not run for tampered stored argv")
		return nil, nil
	}

	code := runWithDeps([]string{
		"provision", "down",
		"--json",
		"--approve",
		"--app-data-dir", appDataDir,
		"--record-id", record.RecordID,
	}, deps)
	if code != 1 {
		t.Fatalf("exit code = %d, want runtime failure", code)
	}
	if !strings.Contains(stderr.String(), "stored teardown argv does not match") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func assertAWSCloudFormationTemplate(t *testing.T, template string) {
	t.Helper()
	for _, required := range []string{
		"AWSTemplateFormatVersion: '2010-09-09'",
		"Type: AWS::EC2::Instance",
		"Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
		"/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id",
		"TailscaleAuthKey:\n    Type: String\n    NoEcho: true",
		"PairingTokenHash:\n    Type: String\n    NoEcho: true",
		"ProvisionAttestationKey:\n    Type: String\n    NoEcho: true",
		"SecurityGroupId:\n    Type: String",
		"CreateRuntimeSecurityGroup: !Equals [!Ref SecurityGroupId, '']",
		"tailscale up --auth-key \"$tailscale_auth_key\" --hostname \"$runtime_name\"",
		"setta:runtime_name",
		"Fn::Base64: !Sub |",
		"runtime_name='${RuntimeName}'",
		"tailscale_auth_key='${TailscaleAuthKey}'",
		"pairing_token_hash='${PairingTokenHash}'",
		"provision_attestation_key='${ProvisionAttestationKey}'",
	} {
		if !strings.Contains(template, required) {
			t.Fatalf("template missing %q:\n%s", required, template)
		}
	}
	for _, forbidden := range []string{
		"%%setta_cfn_",
		"SecurityGroupIngress",
		"tskey-auth-test-secret",
		"attestation-key-with",
	} {
		if strings.Contains(template, forbidden) {
			t.Fatalf("template contains forbidden %q:\n%s", forbidden, template)
		}
	}
	if !strings.Contains(template, "${!runtime_name}") {
		t.Fatalf("template did not escape shell ${...} fragments for CloudFormation Fn::Sub:\n%s", template)
	}
}

func provisionExecutionTestFileInput(name string, path string) provisionExecutionFileInput {
	return provisionExecutionFileInput{
		Name:      name,
		Path:      path,
		Purpose:   "test fixture file",
		SizeBytes: 128,
		SHA256:    strings.Repeat("a", 64),
		Sensitive: true,
	}
}

func writeProvisionExecutionTempFile(t *testing.T, name string, content string, mode os.FileMode) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	if err := os.Chmod(path, mode); err != nil {
		t.Fatalf("chmod temp file: %v", err)
	}
	return path
}

func provisionUpApprovedHetznerArgs(appDataDir string, cloudInitPath string) []string {
	return []string{
		"provision", "up",
		"--json",
		"--approve",
		"--app-data-dir", appDataDir,
		"--provider", "hetzner",
		"--runtime-name", "setta-test-runtime",
		"--shape", "dev-standard",
		"--region", "fsn1",
		"--cloud-init-file", cloudInitPath,
	}
}

func writeSucceededHetznerCreationRecord(t *testing.T, appDataDir string, deps cliDeps) provisionCreationRecord {
	t.Helper()
	cloudInitPath := writeProvisionExecutionTempFile(t, "cloud-init.yaml", "#cloud-config\n", 0o600)
	options := provisionUpOptions{
		Provider:      "hetzner",
		RuntimeName:   "setta-test-runtime",
		Shape:         "dev-standard",
		Region:        "fsn1",
		InstanceType:  "cx42",
		DiskGB:        96,
		CloudInitFile: cloudInitPath,
	}
	plan, err := planProvisionUp(options)
	if err != nil {
		t.Fatalf("plan provision up: %v", err)
	}
	record, err := newProvisionCreationRecord(options, plan, deps.now().UTC())
	if err != nil {
		t.Fatalf("new creation record: %v", err)
	}
	record = record.withExecutionResult(provisionExecutionRunResult{
		Status:     provisionCreationStatusSucceeded,
		ResourceID: "12345",
	}, deps.now().UTC())
	if err := newProvisionCreationStore(appDataDir, deps).write(provisionCreationRegistry{
		Creations: []provisionCreationRecord{record},
	}); err != nil {
		t.Fatalf("write creation record: %v", err)
	}
	return record
}

func writeSucceededAWSCreationRecord(t *testing.T, appDataDir string, deps cliDeps) provisionCreationRecord {
	t.Helper()
	templatePath := writeProvisionExecutionTempFile(t, "aws-template.yaml", "Resources: {}\n", 0o644)
	parametersPath := writeProvisionExecutionTempFile(t, "aws-parameters.json", "[]\n", 0o600)
	options := provisionUpOptions{
		Provider:                     "aws",
		RuntimeName:                  "setta-test-runtime",
		Shape:                        "dev-standard",
		Region:                       "us-east-1",
		InstanceType:                 "t3.xlarge",
		DiskGB:                       96,
		StackName:                    "setta-setta-test-runtime",
		CloudFormationTemplateFile:   templatePath,
		CloudFormationParametersFile: parametersPath,
	}
	plan, err := planProvisionUp(options)
	if err != nil {
		t.Fatalf("plan provision up: %v", err)
	}
	record, err := newProvisionCreationRecord(options, plan, deps.now().UTC())
	if err != nil {
		t.Fatalf("new creation record: %v", err)
	}
	record = record.withExecutionResult(provisionExecutionRunResult{
		Status:     provisionCreationStatusSucceeded,
		ResourceID: "arn:aws:cloudformation:us-east-1:123456789012:stack/setta-setta-test-runtime/stack-id",
	}, deps.now().UTC())
	if err := newProvisionCreationStore(appDataDir, deps).write(provisionCreationRegistry{
		Creations: []provisionCreationRecord{record},
	}); err != nil {
		t.Fatalf("write creation record: %v", err)
	}
	return record
}

func expectAWSLookPath(t *testing.T) func(string) (string, error) {
	t.Helper()
	return func(name string) (string, error) {
		if name != "aws" {
			t.Fatalf("lookPath name = %s, want aws", name)
		}
		return "/usr/bin/aws", nil
	}
}

func expectHcloudLookPath(t *testing.T) func(string) (string, error) {
	t.Helper()
	return func(name string) (string, error) {
		if name != "hcloud" {
			t.Fatalf("lookPath name = %s, want hcloud", name)
		}
		return "/usr/bin/hcloud", nil
	}
}

func assertAWSDiagnoseCommand(t *testing.T, name string, args []string) {
	t.Helper()
	if name != "aws" {
		t.Fatalf("command name = %s, want aws", name)
	}
	want := []string{
		"cloudformation",
		"describe-stack-events",
		"--stack-name",
		"setta-setta-test-runtime",
		"--region",
		"us-east-1",
		"--max-items",
		"20",
		"--output",
		"json",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

func assertHcloudDeleteCommand(t *testing.T, name string, args []string) {
	t.Helper()
	if name != "hcloud" {
		t.Fatalf("command name = %s, want hcloud", name)
	}
	want := []string{"server", "delete", "12345"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

func assertHcloudCreateCommand(t *testing.T, name string, args []string, cloudInitPath string) {
	t.Helper()
	if name != "hcloud" {
		t.Fatalf("command name = %s, want hcloud", name)
	}
	if !containsString(args, "--user-data-from-file") || !containsString(args, cloudInitPath) {
		t.Fatalf("args = %#v, want cloud-init path %s", args, cloudInitPath)
	}
}

func assertPendingCreationBeforeProviderCommand(t *testing.T, appDataDir string, deps cliDeps, cloudInitPath string, cloudInit string) {
	t.Helper()
	record := readProvisionCreationRecordForTest(t, appDataDir, deps, "hetzner:setta-test-runtime")
	if record.Status != provisionCreationStatusPending {
		t.Fatalf("record status before command = %q, want pending", record.Status)
	}
	redactedCommand := strings.Join(record.CreateAction.RedactedArgv, " ")
	if strings.Contains(redactedCommand, cloudInitPath) {
		t.Fatalf("record redacted argv leaked file path: %#v", record.CreateAction.RedactedArgv)
	}
	if len(record.InputDigests) != 1 || record.InputDigests[0].SHA256 != sha256Hex([]byte(cloudInit)) {
		t.Fatalf("input digests = %+v", record.InputDigests)
	}
	if record.TeardownAction.Ready || !reflect.DeepEqual(record.TeardownAction.MissingFields, []string{"resourceID"}) {
		t.Fatalf("initial teardown action = %+v, want resourceID pending", record.TeardownAction)
	}
}

func readProvisionCreationRecordForTest(t *testing.T, appDataDir string, deps cliDeps, recordID string) provisionCreationRecord {
	t.Helper()
	registry, err := newProvisionCreationStore(appDataDir, deps).read()
	if err != nil {
		t.Fatalf("read creation registry: %v", err)
	}
	record, ok := provisionCreationRecordByID(registry, recordID)
	if !ok {
		t.Fatalf("creation record %q missing: %+v", recordID, registry)
	}
	return record
}

func provisionNextActionIDs(actions []provisionCreationNextAction) []string {
	ids := make([]string, 0, len(actions))
	for _, action := range actions {
		ids = append(ids, action.ID)
	}
	return ids
}

func assertManualParameterNoEcho(t *testing.T, parameters []provisionLinkManualParameter, key string) {
	t.Helper()
	for _, parameter := range parameters {
		if parameter.Key == key {
			if !parameter.NoEcho || !parameter.Required {
				t.Fatalf("manual parameter %s = %+v, want required NoEcho", key, parameter)
			}
			return
		}
	}
	t.Fatalf("manual parameter %s missing from %+v", key, parameters)
}

func quickCreateFragmentQuery(t *testing.T, rawURL string) url.Values {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse quick-create URL: %v", err)
	}
	fragment := parsed.Fragment
	index := strings.Index(fragment, "?")
	if index < 0 {
		t.Fatalf("quick-create URL fragment has no query: %s", rawURL)
	}
	query, err := url.ParseQuery(fragment[index+1:])
	if err != nil {
		t.Fatalf("parse quick-create fragment query: %v", err)
	}
	return query
}

func provisionRenderLinkArgs() []string {
	return []string{
		"--json",
		"--provider", "aws",
		"--runtime-name", "setta-test-runtime",
		"--shape", "dev-standard",
		"--region", "us-east-1",
		"--disk-gb", "96",
		"--provision-id", "provision_test_012345",
		"--expires-at", "2026-07-07T10:00:00Z",
		"--setta-version", "v1.2.3",
		"--release-base-url", "https://downloads.example.test/setta/v1.2.3",
		"--installer-sha256", strings.Repeat("a", 64),
		"--minisign-public-key", "RWQtestminisignpublickey",
	}
}
