package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type provisionAWSPlacementInput struct {
	VPCID           string
	SubnetID        string
	SecurityGroupID string
}

type provisionAWSPlacement struct {
	VPCID              string `json:"vpcId,omitempty"`
	SubnetID           string `json:"subnetId,omitempty"`
	SecurityGroupID    string `json:"securityGroupId,omitempty"`
	SecurityGroupMode  string `json:"securityGroupMode"`
	Source             string `json:"source"`
	DefaultVPCRequired bool   `json:"defaultVpcRequired"`
}

type awsDescribeVPCsResult struct {
	VPCs []awsVPC `json:"Vpcs"`
}

type awsVPC struct {
	VPCID string `json:"VpcId"`
}

type awsDescribeSubnetsResult struct {
	Subnets []awsSubnet `json:"Subnets"`
}

type awsSubnet struct {
	SubnetID string `json:"SubnetId"`
}

func normalizeAWSPlacementInput(input provisionAWSPlacementInput) (provisionAWSPlacementInput, error) {
	var err error
	input.VPCID, err = normalizeOptionalAWSResourceID("aws-vpc-id", input.VPCID, "vpc-")
	if err != nil {
		return provisionAWSPlacementInput{}, err
	}
	input.SubnetID, err = normalizeOptionalAWSResourceID("aws-subnet-id", input.SubnetID, "subnet-")
	if err != nil {
		return provisionAWSPlacementInput{}, err
	}
	input.SecurityGroupID, err = normalizeOptionalAWSResourceID("aws-security-group-id", input.SecurityGroupID, "sg-")
	if err != nil {
		return provisionAWSPlacementInput{}, err
	}
	if input.SubnetID != "" && input.SecurityGroupID == "" && input.VPCID == "" {
		return provisionAWSPlacementInput{}, errors.New("aws-vpc-id is required when aws-subnet-id is set without aws-security-group-id")
	}
	return input, nil
}

func normalizeOptionalAWSResourceID(label string, value string, prefix string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", nil
	}
	normalized, err := requirePlainField(label, trimmed, len(prefix)+1, 128)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(normalized, prefix) {
		return "", fmt.Errorf("%s must start with %s", label, prefix)
	}
	return normalized, nil
}

func (input provisionAWSPlacementInput) hasAny() bool {
	return input.VPCID != "" || input.SubnetID != "" || input.SecurityGroupID != ""
}

func catalogAWSPlacement(input provisionAWSPlacementInput) (provisionAWSPlacement, []string) {
	placement := awsPlacementFromInput(input, "caller")
	if input.hasAny() {
		return placement, awsPlacementWarnings(placement)
	}
	placement.Source = "implicit_default"
	placement.DefaultVPCRequired = true
	return placement, []string{awsDefaultVPCRequiredWarning()}
}

func resolveAWSPlacement(ctx context.Context, provider provisionCatalogProvider, region string, input provisionAWSPlacementInput, deps cliDeps) (*provisionAWSPlacement, []string) {
	if input.hasAny() {
		placement := awsPlacementFromInput(input, "caller")
		return &placement, awsPlacementWarnings(placement)
	}
	placement, warnings, ok := resolveAWSDefaultPlacement(ctx, provider, region, deps)
	if ok {
		return &placement, warnings
	}
	fallback := awsPlacementFromInput(provisionAWSPlacementInput{}, "implicit_default")
	fallback.DefaultVPCRequired = true
	warnings = append(warnings, awsDefaultVPCRequiredWarning())
	return &fallback, warnings
}

func awsPlacementFromInput(input provisionAWSPlacementInput, source string) provisionAWSPlacement {
	placement := provisionAWSPlacement{
		VPCID:             input.VPCID,
		SubnetID:          input.SubnetID,
		SecurityGroupID:   input.SecurityGroupID,
		SecurityGroupMode: "create",
		Source:            source,
	}
	if input.SecurityGroupID != "" {
		placement.SecurityGroupMode = "existing"
	}
	return placement
}

func resolveAWSDefaultPlacement(ctx context.Context, provider provisionCatalogProvider, region string, deps cliDeps) (provisionAWSPlacement, []string, bool) {
	output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, []string{"ec2", "describe-vpcs", "--filters", "Name=isDefault,Values=true", "--region", region, "--output", "json"})
	if err != nil {
		return provisionAWSPlacement{}, []string{awsPlacementProbeFailureWarning("default VPC", output, err)}, false
	}
	var vpcs awsDescribeVPCsResult
	if err := json.Unmarshal(output, &vpcs); err != nil {
		return provisionAWSPlacement{}, []string{"aws live default VPC output could not be parsed; provide --aws-vpc-id and --aws-subnet-id before approval if the account has no default VPC"}, false
	}
	vpcID := firstAWSVPCID(vpcs.VPCs)
	if vpcID == "" {
		return provisionAWSPlacement{}, []string{"AWS reported no default VPC in the selected region; provide --aws-vpc-id and --aws-subnet-id before approval"}, false
	}
	placement := provisionAWSPlacement{
		VPCID:             vpcID,
		SecurityGroupMode: "create",
		Source:            "live_default",
	}
	warnings := make([]string, 0)
	subnetOutput, err := runProviderProbe(ctx, deps, provider.CLI.Binary, []string{"ec2", "describe-subnets", "--filters", "Name=vpc-id,Values=" + vpcID, "Name=default-for-az,Values=true", "--region", region, "--output", "json"})
	if err != nil {
		warnings = append(warnings, awsPlacementProbeFailureWarning("default subnet", subnetOutput, err))
		return placement, warnings, true
	}
	var subnets awsDescribeSubnetsResult
	if err := json.Unmarshal(subnetOutput, &subnets); err != nil {
		warnings = append(warnings, "aws live default subnet output could not be parsed; provide --aws-subnet-id before approval if AWS does not select a subnet")
		return placement, warnings, true
	}
	placement.SubnetID = firstAWSSubnetID(subnets.Subnets)
	if placement.SubnetID == "" {
		warnings = append(warnings, "AWS reported no default subnet in the selected region; provide --aws-subnet-id before approval")
	}
	return placement, warnings, true
}

func firstAWSVPCID(vpcs []awsVPC) string {
	for _, vpc := range vpcs {
		if vpcID := strings.TrimSpace(vpc.VPCID); vpcID != "" {
			return vpcID
		}
	}
	return ""
}

func firstAWSSubnetID(subnets []awsSubnet) string {
	for _, subnet := range subnets {
		if subnetID := strings.TrimSpace(subnet.SubnetID); subnetID != "" {
			return subnetID
		}
	}
	return ""
}

func awsPlacementWarnings(placement provisionAWSPlacement) []string {
	warnings := make([]string, 0)
	if placement.Source == "caller" && placement.VPCID == "" && placement.SubnetID == "" && placement.SecurityGroupID == "" {
		warnings = append(warnings, awsDefaultVPCRequiredWarning())
	}
	if placement.VPCID != "" && placement.SubnetID == "" && placement.SecurityGroupID == "" {
		warnings = append(warnings, "AWS placement has a VPC id but no subnet id; provide --aws-subnet-id before approval if the VPC has no default subnet")
	}
	if placement.SecurityGroupID != "" && placement.SubnetID == "" {
		warnings = append(warnings, "AWS placement reuses a security group but no subnet id was supplied; AWS may still require a matching subnet")
	}
	return warnings
}

func awsDefaultVPCRequiredWarning() string {
	return "AWS placement did not resolve an explicit VPC/subnet/security group; create will rely on the selected region's default VPC. Provide --aws-vpc-id and --aws-subnet-id before approval if this account has no default VPC."
}

func awsPlacementProbeFailureWarning(probe string, output []byte, err error) string {
	warning := "aws live " + probe + " probe failed"
	if trimmed := trimCommandOutput(output); trimmed != "" {
		warning += ": " + trimmed
	} else if err != nil {
		warning += ": " + err.Error()
	}
	return warning
}
