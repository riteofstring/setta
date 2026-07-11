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
	if result.DefaultShape != "dev-standard" {
		t.Fatalf("defaultShape = %q, want dev-standard", result.DefaultShape)
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

func TestProvisionResolveUsesAWSLiveInstanceTypeData(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = func(name string) (string, error) {
		if name == "aws" {
			return "/usr/bin/aws", nil
		}
		return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
	}
	deps.commandRunner = awsProbeOutputRunner(t, map[string][]byte{
		awsProbeKey([]string{
			"ec2", "describe-instance-type-offerings",
			"--filters", "Name=instance-type,Values=t3.xlarge",
			"--region", "us-east-1",
			"--output", "json",
		}): []byte(`{"InstanceTypeOfferings":[{"InstanceType":"t3.xlarge","LocationType":"region","Location":"us-east-1"}]}`),
		awsProbeKey([]string{
			"ec2", "describe-instance-types",
			"--instance-types", "t3.xlarge",
			"--region", "us-east-1",
			"--output", "json",
		}): []byte(`{"InstanceTypes":[{"InstanceType":"t3.xlarge","VCpuInfo":{"DefaultVCpus":4},"MemoryInfo":{"SizeInMiB":16384}}]}`),
		awsProbeKey([]string{
			"ec2", "describe-vpcs",
			"--filters", "Name=isDefault,Values=true",
			"--region", "us-east-1",
			"--output", "json",
		}): []byte(`{"Vpcs":[{"VpcId":"vpc-default123"}]}`),
		awsProbeKey([]string{
			"ec2", "describe-subnets",
			"--filters", "Name=vpc-id,Values=vpc-default123", "Name=default-for-az,Values=true",
			"--region", "us-east-1",
			"--output", "json",
		}): []byte(`{"Subnets":[{"SubnetId":"subnet-default123"}]}`),
	})

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
	resolution := result.Resolution
	if resolution.Source != "live_cli" || resolution.InstanceType != "t3.xlarge" || resolution.Region != "us-east-1" {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Machine.CPUs != 4 || resolution.Machine.MemoryGB != 16 {
		t.Fatalf("machine = %+v", resolution.Machine)
	}
	if resolution.Cost.Kind != "unknown" || !strings.Contains(resolution.Cost.Description, "AWS CLI") {
		t.Fatalf("cost = %+v", resolution.Cost)
	}
	if resolution.AWSPlacement == nil ||
		resolution.AWSPlacement.VPCID != "vpc-default123" ||
		resolution.AWSPlacement.SubnetID != "subnet-default123" ||
		resolution.AWSPlacement.SecurityGroupMode != "create" ||
		resolution.AWSPlacement.Source != "live_default" ||
		resolution.AWSPlacement.DefaultVPCRequired {
		t.Fatalf("aws placement = %+v", resolution.AWSPlacement)
	}
}

func TestProvisionResolveAWSExplicitPlacementSkipsDefaultVPCProbe(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = func(name string) (string, error) {
		if name == "aws" {
			return "/usr/bin/aws", nil
		}
		return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
	}
	deps.commandRunner = awsProbeOutputRunner(t, map[string][]byte{
		awsProbeKey([]string{
			"ec2", "describe-instance-type-offerings",
			"--filters", "Name=instance-type,Values=t3.xlarge",
			"--region", "us-east-1",
			"--output", "json",
		}): []byte(`{"InstanceTypeOfferings":[{"InstanceType":"t3.xlarge"}]}`),
		awsProbeKey([]string{
			"ec2", "describe-instance-types",
			"--instance-types", "t3.xlarge",
			"--region", "us-east-1",
			"--output", "json",
		}): []byte(`{"InstanceTypes":[{"InstanceType":"t3.xlarge","VCpuInfo":{"DefaultVCpus":4},"MemoryInfo":{"SizeInMiB":16384}}]}`),
	})

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "aws",
		"--shape", "dev-standard",
		"--region", "us-east-1",
		"--aws-vpc-id", "vpc-explicit123",
		"--aws-subnet-id", "subnet-explicit123",
		"--aws-security-group-id", "sg-explicit123",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	placement := result.Resolution.AWSPlacement
	if placement == nil ||
		placement.VPCID != "vpc-explicit123" ||
		placement.SubnetID != "subnet-explicit123" ||
		placement.SecurityGroupID != "sg-explicit123" ||
		placement.SecurityGroupMode != "existing" ||
		placement.Source != "caller" ||
		placement.DefaultVPCRequired {
		t.Fatalf("aws placement = %+v", placement)
	}
}

func TestProvisionResolveUsesGCPLiveMachineTypeData(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = func(name string) (string, error) {
		if name == "gcloud" {
			return "/usr/bin/gcloud", nil
		}
		return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
	}
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "gcloud" || !reflect.DeepEqual(args, []string{
			"compute", "machine-types", "list",
			"--filter=name=e2-standard-4",
			"--format=json(name,guestCpus,memoryMb,zone,selfLink)",
		}) {
			return nil, fmt.Errorf("unexpected command %s %v", name, args)
		}
		return []byte(`[
  {"name":"e2-standard-4","guestCpus":4,"memoryMb":16384,"zone":"https://www.googleapis.com/compute/v1/projects/setta/zones/europe-west1-b"},
  {"name":"e2-standard-4","guestCpus":4,"memoryMb":16384,"zone":"https://www.googleapis.com/compute/v1/projects/setta/zones/us-central1-a"}
]`), nil
	}

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "gcp",
		"--shape", "dev-standard",
		"--region", "us-central1",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	resolution := result.Resolution
	if resolution.Source != "live_cli" || resolution.InstanceType != "e2-standard-4" || resolution.Region != "us-central1" {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Machine.CPUs != 4 || resolution.Machine.MemoryGB != 16 {
		t.Fatalf("machine = %+v", resolution.Machine)
	}
}

func TestProvisionResolveUsesDigitalOceanLiveSizeAndPriceData(t *testing.T) {
	var stdout bytes.Buffer
	deps := testDeps()
	deps.stdout = &stdout
	deps.lookPath = func(name string) (string, error) {
		if name == "doctl" {
			return "/usr/bin/doctl", nil
		}
		return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
	}
	deps.commandRunner = func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "doctl" || !reflect.DeepEqual(args, []string{"compute", "size", "list", "--output", "json"}) {
			return nil, fmt.Errorf("unexpected command %s %v", name, args)
		}
		return []byte(`[
  {"slug":"s-4vcpu-8gb","memory":8192,"vcpus":4,"disk":160,"price_hourly":0.07143,"regions":["nyc3","sfo3"],"available":true},
  {"slug":"s-4vcpu-16gb","memory":16384,"vcpus":4,"disk":320,"price_hourly":0.14286,"regions":["nyc3","sfo3"],"available":true},
  {"slug":"s-8vcpu-32gb","memory":32768,"vcpus":8,"disk":640,"price_hourly":0.28571,"regions":["nyc3"],"available":true}
]`), nil
	}

	code := runWithDeps([]string{
		"provision", "resolve", "--json",
		"--provider", "digitalocean",
		"--shape", "dev-standard",
		"--region", "sfo3",
	}, deps)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	var result provisionResolveResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatalf("parse resolve JSON: %v\n%s", err, stdout.String())
	}
	resolution := result.Resolution
	if resolution.Source != "live_cli" || resolution.InstanceType != "s-4vcpu-16gb" || resolution.Region != "sfo3" {
		t.Fatalf("resolution = %+v", resolution)
	}
	if resolution.Cost.Kind != "live_hourly" || resolution.Cost.Amount != "0.14286" || resolution.Cost.Currency != "USD" {
		t.Fatalf("cost = %+v", resolution.Cost)
	}
	if resolution.DiskGB != 320 || resolution.Machine.DiskGB != 320 {
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

func awsProbeOutputRunner(t *testing.T, outputs map[string][]byte) func(context.Context, string, ...string) ([]byte, error) {
	t.Helper()
	return func(_ context.Context, name string, args ...string) ([]byte, error) {
		if name != "aws" {
			return nil, fmt.Errorf("unexpected command %s %v", name, args)
		}
		output, ok := outputs[awsProbeKey(args)]
		if !ok {
			return nil, fmt.Errorf("unexpected aws args %v", args)
		}
		return output, nil
	}
}

func awsProbeKey(args []string) string {
	return strings.Join(args, "\x00")
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
