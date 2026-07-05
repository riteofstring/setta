package main

import (
	"bytes"
	"encoding/json"
	"net/url"
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
