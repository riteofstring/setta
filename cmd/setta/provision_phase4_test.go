package main

import (
	"bytes"
	"encoding/json"
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

func TestProvisionUpWithoutPlanOnlyRefusesMutation(t *testing.T) {
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
	if !strings.Contains(stderr.String(), "execution is blocked until pending creation records and approval wiring are implemented") {
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
