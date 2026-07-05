package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"reflect"
	"strings"
	"testing"
)

func TestProvisionShapesEmitsFallbackCatalogData(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout

	code := runWithDeps([]string{"provision", "shapes", "--json"}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionShapesResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse shapes JSON: %v\n%s", err, stdout.String())
	}
	if !result.OK {
		t.Fatal("ok = false, want true")
	}
	hetzner := requireCatalogProvider(t, result.Catalog, "hetzner")
	if hetzner.ImageSelector.Kind != "image_alias" || hetzner.ImageSelector.Value != "ubuntu-24.04" {
		t.Fatalf("hetzner image selector = %+v", hetzner.ImageSelector)
	}
	aws := requireCatalogProvider(t, result.Catalog, "aws")
	if aws.Mappings["gpu-large"].InstanceType == "" {
		t.Fatalf("aws gpu-large mapping missing: %+v", aws.Mappings)
	}
	paperspace := requireCatalogProvider(t, result.Catalog, "paperspace")
	if paperspace.Mappings["gpu-small"].GPUClass != "entry" {
		t.Fatalf("paperspace gpu-small mapping = %+v", paperspace.Mappings["gpu-small"])
	}
}

func TestProvisionDetectReportsCLIAuthStates(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = func(name string) (string, error) {
		switch name {
		case "hcloud", "aws":
			return "/usr/bin/" + name, nil
		default:
			return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
		}
	}
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		switch {
		case name == "hcloud" && reflect.DeepEqual(args, []string{"version"}):
			return []byte("hcloud v1.50.0\n"), nil
		case name == "hcloud" && reflect.DeepEqual(args, []string{"context", "active"}):
			return []byte("setta-test\n"), nil
		case name == "aws" && reflect.DeepEqual(args, []string{"--version"}):
			return []byte("aws-cli/2.15.0 Python/3.11\n"), nil
		case name == "aws" && reflect.DeepEqual(args, []string{"sts", "get-caller-identity", "--output", "json"}):
			return []byte("Unable to locate credentials\n"), errors.New("exit status 255")
		default:
			return nil, fmt.Errorf("unexpected command %s %v", name, args)
		}
	}

	code := runWithDeps([]string{"provision", "detect", "--json"}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionDetectResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse detect JSON: %v\n%s", err, stdout.String())
	}
	if status := requireDetection(t, result, "hetzner").Status; status != "authenticated" {
		t.Fatalf("hetzner status = %q", status)
	}
	aws := requireDetection(t, result, "aws")
	if aws.Status != "not_authenticated" || !strings.Contains(aws.ProviderOutput, "Unable to locate credentials") {
		t.Fatalf("aws detection = %+v", aws)
	}
	if status := requireDetection(t, result, "gcp").Status; status != "not_found" {
		t.Fatalf("gcp status = %q", status)
	}
	if status := requireDetection(t, result, "paperspace").Status; status != "manual_only" {
		t.Fatalf("paperspace status = %q", status)
	}
}

func TestProvisionResolveUsesCatalogFallback(t *testing.T) {
	var stdout bytes.Buffer
	deps := provisionResolveNoCLIDeps(&stdout)

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "aws",
		"--shape", "dev-standard",
		"--region", "us-east-1",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	if result.Resolution.Source != "catalog" || result.Resolution.InstanceType != "t3.xlarge" {
		t.Fatalf("resolution = %+v", result.Resolution)
	}
	if result.Resolution.ImageSelector.Kind != "aws_ssm_ubuntu_lts" {
		t.Fatalf("image selector = %+v", result.Resolution.ImageSelector)
	}
	if result.Resolution.DiskGB != 64 || result.Resolution.Cost.Kind != "class" {
		t.Fatalf("disk/cost = %+v %+v", result.Resolution.DiskGB, result.Resolution.Cost)
	}
}

func TestProvisionResolveExactInstanceTypeIsExplicitEscapeHatch(t *testing.T) {
	var stdout bytes.Buffer
	deps := provisionResolveNoCLIDeps(&stdout)

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "gcp",
		"--shape", "dev-standard",
		"--exact-instance-type", "custom-4-32768",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	if result.Resolution.InstanceType != "custom-4-32768" {
		t.Fatalf("instance type = %q", result.Resolution.InstanceType)
	}
	if len(result.Warnings) == 0 || !strings.Contains(result.Warnings[0], "not validated") {
		t.Fatalf("warnings = %v", result.Warnings)
	}
}

func TestProvisionResolveUsesHcloudLiveServerTypeData(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = func(name string) (string, error) {
		if name == "hcloud" {
			return "/usr/bin/hcloud", nil
		}
		return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
	}
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "hcloud" || !reflect.DeepEqual(args, []string{"server-type", "list", "-o", "json"}) {
			return nil, fmt.Errorf("unexpected command %s %v", name, args)
		}
		return []byte(`[
  {"name":"cx22","cores":2,"memory":4,"disk":40,"prices":[{"location":"fsn1","price_hourly":{"gross":"0.0060","net":"0.0050"}}]},
  {"name":"cx32","cores":4,"memory":8,"disk":80,"prices":[{"location":"fsn1","price_hourly":{"gross":"0.0113","net":"0.0095"}}]},
  {"name":"cx42","cores":8,"memory":16,"disk":160,"prices":[{"location":"fsn1","price_hourly":{"gross":"0.0273","net":"0.0230"}}]}
]`), nil
	}

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "hetzner",
		"--shape", "dev-standard",
		"--disk-gb", "96",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	resolution := result.Resolution
	if resolution.Source != "live_cli" || resolution.InstanceType != "cx42" {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Cost.Kind != "live_hourly" || resolution.Cost.Amount != "0.0273" || resolution.Cost.Currency != "EUR" {
		t.Fatalf("cost = %+v", resolution.Cost)
	}
	if resolution.DiskGB != 96 || resolution.Machine.DiskGB != 160 {
		t.Fatalf("disk = resolution %d machine %+v", resolution.DiskGB, resolution.Machine)
	}
}

func TestProvisionResolveRecordsIntentWithoutParsingIt(t *testing.T) {
	var stdout bytes.Buffer
	deps := provisionResolveNoCLIDeps(&stdout)

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "aws",
		"--intent", "cheap box for agents",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	if result.Request.Shape != "dev-standard" || result.Request.Constraints.Intent != "cheap box for agents" {
		t.Fatalf("request = %+v", result.Request)
	}
	if result.Resolution.InstanceType != "t3.xlarge" {
		t.Fatalf("intent was parsed into unexpected resolution: %+v", result.Resolution)
	}
}

func provisionResolveNoCLIDeps(stdout *bytes.Buffer) cliDeps {
	deps := testDeps()
	deps.stdout = stdout
	deps.lookPath = func(name string) (string, error) {
		return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
	}
	return deps
}

func requireCatalogProvider(t *testing.T, catalog provisionCatalog, providerID string) provisionCatalogProvider {
	t.Helper()
	provider, ok := provisionCatalogProviderByID(catalog, providerID)
	if !ok {
		t.Fatalf("provider %q missing from catalog", providerID)
	}
	return provider
}

func requireDetection(t *testing.T, result provisionDetectResult, providerID string) provisionProviderDetection {
	t.Helper()
	for _, detection := range result.Providers {
		if detection.Provider == providerID {
			return detection
		}
	}
	t.Fatalf("provider %q missing from detect result: %+v", providerID, result.Providers)
	return provisionProviderDetection{}
}
