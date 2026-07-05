package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

type provisionResolveOptions struct {
	AWSPlacement     provisionAWSPlacementInput
	BudgetPreference string
	CPUMin           int
	DiskGB           int
	ExactInstance    string
	GPUClass         string
	Intent           string
	JSON             bool
	MemoryGBMin      int
	Provider         string
	Region           string
	Shape            string
	WorkloadNote     string
}

type provisionResolveResult struct {
	OK         bool                         `json:"ok"`
	Request    provisionResolveRequest      `json:"request"`
	Resolution provisionResolvedCandidate   `json:"resolution"`
	Candidates []provisionResolvedCandidate `json:"candidates"`
	Warnings   []string                     `json:"warnings,omitempty"`
}

type provisionResolveRequest struct {
	Provider    string                      `json:"provider"`
	Shape       string                      `json:"shape"`
	Constraints provisionResolveConstraints `json:"constraints"`
}

type provisionResolveConstraints struct {
	CPUMin           int    `json:"cpuMin,omitempty"`
	MemoryGBMin      int    `json:"memoryGbMin,omitempty"`
	GPUClass         string `json:"gpuClass,omitempty"`
	BudgetPreference string `json:"budgetPreference,omitempty"`
	RegionPreference string `json:"regionPreference,omitempty"`
	DiskGB           int    `json:"diskGb,omitempty"`
	WorkloadNote     string `json:"workloadNote,omitempty"`
	Intent           string `json:"intent,omitempty"`
	ExactInstance    string `json:"exactInstance,omitempty"`
}

type provisionResolvedCandidate struct {
	Provider      string                        `json:"provider"`
	DisplayName   string                        `json:"displayName"`
	Shape         string                        `json:"shape"`
	Source        string                        `json:"source"`
	InstanceType  string                        `json:"instanceType"`
	Region        string                        `json:"region"`
	RegionOptions []string                      `json:"regionOptions"`
	AWSPlacement  *provisionAWSPlacement        `json:"awsPlacement,omitempty"`
	DiskGB        int                           `json:"diskGb"`
	Machine       provisionResolvedMachine      `json:"machine"`
	ImageSelector provisionCatalogImageSelector `json:"imageSelector"`
	Cost          provisionResolvedCost         `json:"cost"`
	Approval      provisionResolutionApproval   `json:"approval"`
	Warnings      []string                      `json:"warnings,omitempty"`
}

type provisionResolvedMachine struct {
	CPUs     int    `json:"cpus,omitempty"`
	MemoryGB int    `json:"memoryGb,omitempty"`
	GPUClass string `json:"gpuClass,omitempty"`
	DiskGB   int    `json:"diskGb,omitempty"`
}

type provisionResolvedCost struct {
	Kind        string `json:"kind"`
	Class       string `json:"class,omitempty"`
	Amount      string `json:"amount,omitempty"`
	Currency    string `json:"currency,omitempty"`
	PricingURL  string `json:"pricingUrl"`
	Description string `json:"description"`
}

type provisionResolutionApproval struct {
	RequiresMutationApproval bool     `json:"requiresMutationApproval"`
	CommandPreview           []string `json:"commandPreview"`
	SecretFree               bool     `json:"secretFree"`
}

type hcloudServerType struct {
	Name   string            `json:"name"`
	Cores  int               `json:"cores"`
	Memory float64           `json:"memory"`
	Disk   int               `json:"disk"`
	Prices []hcloudTypePrice `json:"prices"`
}

type hcloudTypePrice struct {
	Location    string            `json:"location"`
	PriceHourly hcloudHourlyPrice `json:"price_hourly"`
}

type hcloudHourlyPrice struct {
	Gross string `json:"gross"`
	Net   string `json:"net"`
}

type awsDescribeInstanceTypesResult struct {
	InstanceTypes []awsInstanceType `json:"InstanceTypes"`
}

type awsInstanceType struct {
	InstanceType string        `json:"InstanceType"`
	VCpuInfo     awsVCpuInfo   `json:"VCpuInfo"`
	MemoryInfo   awsMemoryInfo `json:"MemoryInfo"`
	GPUInfo      awsGPUInfo    `json:"GpuInfo"`
}

type awsVCpuInfo struct {
	DefaultVCpus int `json:"DefaultVCpus"`
}

type awsMemoryInfo struct {
	SizeInMiB int `json:"SizeInMiB"`
}

type awsGPUInfo struct {
	GPUs []awsGPU `json:"Gpus"`
}

type awsGPU struct {
	Count int `json:"Count"`
}

type awsDescribeInstanceTypeOfferingsResult struct {
	InstanceTypeOfferings []awsInstanceTypeOffering `json:"InstanceTypeOfferings"`
}

type awsInstanceTypeOffering struct {
	InstanceType string `json:"InstanceType"`
}

type gcpMachineType struct {
	Name     string `json:"name"`
	GuestCPU int    `json:"guestCpus"`
	MemoryMB int    `json:"memoryMb"`
	Zone     string `json:"zone"`
	SelfLink string `json:"selfLink"`
}

type digitalOceanSize struct {
	Slug        string   `json:"slug"`
	MemoryMB    int      `json:"memory"`
	VCPUs       int      `json:"vcpus"`
	DiskGB      int      `json:"disk"`
	PriceHourly float64  `json:"price_hourly"`
	Regions     []string `json:"regions"`
	Available   *bool    `json:"available"`
}

func runProvisionResolve(args []string, deps cliDeps) error {
	options, err := provisionResolveOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	result, err := resolveProvision(options, deps)
	if err != nil {
		return err
	}
	return encodeProvisionJSON(deps, result, "resolve JSON")
}

func provisionResolveOptionsFromArgs(args []string, deps cliDeps) (provisionResolveOptions, error) {
	options := provisionResolveOptions{}
	flagSet := newFlagSet("setta provision resolve", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.StringVar(&options.Provider, "provider", "", "provider id; defaults to the catalog default")
	flagSet.StringVar(&options.Shape, "shape", "", "catalog shape id")
	flagSet.StringVar(&options.Region, "region", "", "preferred provider region")
	flagSet.IntVar(&options.DiskGB, "disk-gb", 0, "boot disk size in GiB")
	flagSet.StringVar(&options.Intent, "intent", "", "user intent text recorded as workload context; it is not parsed by this deterministic resolver")
	flagSet.StringVar(&options.WorkloadNote, "workload-note", "", "typed workload note supplied by an AI or caller")
	flagSet.IntVar(&options.CPUMin, "cpu-min", 0, "typed minimum vCPU constraint")
	flagSet.IntVar(&options.MemoryGBMin, "memory-gb-min", 0, "typed minimum memory constraint in GiB")
	flagSet.StringVar(&options.GPUClass, "gpu-class", "", "typed GPU class constraint: entry, large, or any")
	flagSet.StringVar(&options.BudgetPreference, "budget", "", "typed budget preference such as cheapest or balanced")
	flagSet.StringVar(&options.ExactInstance, "exact-instance-type", "", "exact provider instance type escape hatch")
	flagSet.StringVar(&options.AWSPlacement.VPCID, "aws-vpc-id", "", "AWS VPC id for the runtime placement")
	flagSet.StringVar(&options.AWSPlacement.SubnetID, "aws-subnet-id", "", "AWS subnet id for the runtime placement")
	flagSet.StringVar(&options.AWSPlacement.SecurityGroupID, "aws-security-group-id", "", "AWS security group id to reuse instead of creating one")
	if err := flagSet.Parse(args); err != nil {
		return provisionResolveOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionResolveOptions{}, usageError{err: errors.New("setta provision resolve does not accept positional arguments")}
	}
	if !options.JSON {
		return provisionResolveOptions{}, usageError{err: errors.New("setta provision resolve requires --json")}
	}
	if options.CPUMin < 0 || options.MemoryGBMin < 0 || options.DiskGB < 0 {
		return provisionResolveOptions{}, usageError{err: errors.New("cpu-min, memory-gb-min, and disk-gb must not be negative")}
	}
	options.Provider = strings.TrimSpace(options.Provider)
	options.Shape = strings.TrimSpace(options.Shape)
	options.Region = strings.TrimSpace(options.Region)
	options.Intent = strings.TrimSpace(options.Intent)
	options.WorkloadNote = strings.TrimSpace(options.WorkloadNote)
	options.GPUClass = strings.TrimSpace(options.GPUClass)
	options.BudgetPreference = strings.TrimSpace(options.BudgetPreference)
	options.ExactInstance = strings.TrimSpace(options.ExactInstance)
	placement, err := normalizeAWSPlacementInput(options.AWSPlacement)
	if err != nil {
		return provisionResolveOptions{}, err
	}
	options.AWSPlacement = placement
	return options, nil
}

func resolveProvision(options provisionResolveOptions, deps cliDeps) (provisionResolveResult, error) {
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return provisionResolveResult{}, err
	}
	providerID := options.Provider
	if providerID == "" {
		providerID = catalog.DefaultProvider
	}
	provider, ok := provisionCatalogProviderByID(catalog, providerID)
	if !ok {
		return provisionResolveResult{}, usageError{err: fmt.Errorf("unknown provider %q", providerID)}
	}
	if provider.ID != awsProvisionProviderID && options.AWSPlacement.hasAny() {
		return provisionResolveResult{}, usageError{err: errors.New("AWS placement flags require --provider aws")}
	}
	shape, err := resolveRequestedShape(catalog, options)
	if err != nil {
		return provisionResolveResult{}, err
	}
	constraints := provisionResolveConstraints{
		CPUMin:           options.CPUMin,
		MemoryGBMin:      options.MemoryGBMin,
		GPUClass:         options.GPUClass,
		BudgetPreference: options.BudgetPreference,
		RegionPreference: options.Region,
		DiskGB:           options.DiskGB,
		WorkloadNote:     firstNonEmpty(options.WorkloadNote, options.Intent),
		Intent:           options.Intent,
		ExactInstance:    options.ExactInstance,
	}
	candidate, warnings, err := resolveProviderCandidate(context.Background(), provider, shape, constraints, options, deps)
	if err != nil {
		return provisionResolveResult{}, err
	}
	return provisionResolveResult{
		OK: true,
		Request: provisionResolveRequest{
			Provider:    provider.ID,
			Shape:       shape.ID,
			Constraints: constraints,
		},
		Resolution: candidate,
		Candidates: []provisionResolvedCandidate{candidate},
		Warnings:   warnings,
	}, nil
}

func resolveRequestedShape(catalog provisionCatalog, options provisionResolveOptions) (provisionCatalogShape, error) {
	if options.Shape != "" {
		shape, ok := provisionCatalogShapeByID(catalog, options.Shape)
		if !ok {
			return provisionCatalogShape{}, usageError{err: fmt.Errorf("unknown shape %q", options.Shape)}
		}
		if !shapeSatisfiesConstraints(shape, options.CPUMin, options.MemoryGBMin, options.GPUClass) {
			return provisionCatalogShape{}, usageError{err: fmt.Errorf("shape %q does not satisfy requested typed constraints", shape.ID)}
		}
		return shape, nil
	}
	cpuMin := options.CPUMin
	memoryMin := options.MemoryGBMin
	gpuClass := options.GPUClass
	if cpuMin == 0 && memoryMin == 0 && gpuClass == "" {
		shape, ok := provisionCatalogShapeByID(catalog, defaultProvisionShape)
		if !ok {
			return provisionCatalogShape{}, fmt.Errorf("default shape %q missing from catalog", defaultProvisionShape)
		}
		return shape, nil
	}
	for _, shape := range catalog.Shapes {
		if shapeSatisfiesConstraints(shape, cpuMin, memoryMin, gpuClass) {
			return shape, nil
		}
	}
	return provisionCatalogShape{}, usageError{err: errors.New("no catalog shape satisfies requested typed constraints")}
}

func shapeSatisfiesConstraints(shape provisionCatalogShape, cpuMin int, memoryMin int, gpuClass string) bool {
	if shape.CPUMin < cpuMin || shape.MemoryGBMin < memoryMin {
		return false
	}
	switch gpuClass {
	case "", "none":
		return true
	case "any":
		return shape.GPUClass != ""
	default:
		return shape.GPUClass == gpuClass
	}
}

func resolveProviderCandidate(ctx context.Context, provider provisionCatalogProvider, shape provisionCatalogShape, constraints provisionResolveConstraints, options provisionResolveOptions, deps cliDeps) (provisionResolvedCandidate, []string, error) {
	mapping, ok := provider.Mappings[shape.ID]
	if !ok {
		return provisionResolvedCandidate{}, nil, usageError{err: fmt.Errorf("provider %q does not have a fallback mapping for shape %q", provider.ID, shape.ID)}
	}
	warnings := make([]string, 0)
	if options.ExactInstance != "" {
		warnings = append(warnings, "exact instance type was supplied by the caller and was not validated against live provider data or the fallback catalog")
		mapping.InstanceType = options.ExactInstance
	}
	if options.ExactInstance == "" {
		if live, liveWarnings, ok := resolveLiveProviderCandidate(ctx, provider, shape, mapping, constraints, options, deps); ok {
			return live, liveWarnings, nil
		} else {
			warnings = append(warnings, liveWarnings...)
		}
	}
	candidate, candidateWarnings := catalogResolvedCandidate(provider, shape, mapping, constraints, options)
	warnings = append(warnings, candidateWarnings...)
	candidate.Warnings = append(candidate.Warnings, warnings...)
	return candidate, warnings, nil
}

func resolveLiveProviderCandidate(ctx context.Context, provider provisionCatalogProvider, shape provisionCatalogShape, mapping provisionCatalogMapping, constraints provisionResolveConstraints, options provisionResolveOptions, deps cliDeps) (provisionResolvedCandidate, []string, bool) {
	if provider.CLI == nil {
		return provisionResolvedCandidate{}, nil, false
	}
	switch provider.ID {
	case "aws":
		return resolveAWSLiveCandidate(ctx, provider, shape, mapping, constraints, options, deps)
	case "gcp":
		return resolveGCPLiveCandidate(ctx, provider, shape, mapping, constraints, options, deps)
	case "digitalocean":
		return resolveDigitalOceanLiveCandidate(ctx, provider, shape, constraints, options, deps)
	case "hetzner":
		return resolveHetznerLiveCandidate(ctx, provider, shape, constraints, options, deps)
	default:
		return provisionResolvedCandidate{}, nil, false
	}
}

func catalogResolvedCandidate(provider provisionCatalogProvider, shape provisionCatalogShape, mapping provisionCatalogMapping, constraints provisionResolveConstraints, options provisionResolveOptions) (provisionResolvedCandidate, []string) {
	region, warnings := resolveRegion(provider.RegionPreferences, options.Region)
	diskGB := resolveDiskGB(shape, mapping, options.DiskGB)
	candidate := provisionResolvedCandidate{
		Provider:      provider.ID,
		DisplayName:   provider.DisplayName,
		Shape:         shape.ID,
		Source:        "catalog",
		InstanceType:  mapping.InstanceType,
		Region:        region,
		RegionOptions: provider.RegionPreferences,
		DiskGB:        diskGB,
		Machine: provisionResolvedMachine{
			CPUs:     shape.CPUMin,
			MemoryGB: shape.MemoryGBMin,
			GPUClass: firstNonEmpty(mapping.GPUClass, shape.GPUClass),
			DiskGB:   diskGB,
		},
		ImageSelector: provider.ImageSelector,
		Cost: provisionResolvedCost{
			Kind:        "class",
			Class:       mapping.CostClass,
			PricingURL:  provider.PricingURL,
			Description: "catalog cost class; resolve live pricing with the provider CLI or pricing page before approval",
		},
		Approval: provisionResolutionApproval{
			RequiresMutationApproval: true,
			CommandPreview:           nil,
			SecretFree:               true,
		},
		Warnings: warnings,
	}
	if provider.ID == awsProvisionProviderID {
		placement, placementWarnings := catalogAWSPlacement(options.AWSPlacement)
		candidate.AWSPlacement = &placement
		warnings = append(warnings, placementWarnings...)
		candidate.Warnings = warnings
	}
	return candidate, warnings
}

func resolveHetznerLiveCandidate(ctx context.Context, provider provisionCatalogProvider, shape provisionCatalogShape, constraints provisionResolveConstraints, options provisionResolveOptions, deps cliDeps) (provisionResolvedCandidate, []string, bool) {
	if _, err := deps.lookPath(provider.CLI.Binary); err != nil {
		return provisionResolvedCandidate{}, []string{"hcloud CLI was not found; using catalog fallback"}, false
	}
	output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, provider.CLI.LiveResolveArgs)
	if err != nil {
		warning := "hcloud live server-type probe failed; using catalog fallback"
		if trimmed := trimCommandOutput(output); trimmed != "" {
			warning += ": " + trimmed
		}
		if isCommandNotFound(err) {
			warning = "hcloud CLI was not found; using catalog fallback"
		}
		return provisionResolvedCandidate{}, []string{warning}, false
	}
	var serverTypes []hcloudServerType
	if err := json.Unmarshal(output, &serverTypes); err != nil {
		return provisionResolvedCandidate{}, []string{"hcloud live server-type output could not be parsed; using catalog fallback"}, false
	}
	selected, ok := chooseHcloudServerType(serverTypes, shape, constraints)
	if !ok {
		return provisionResolvedCandidate{}, []string{"hcloud live server-type output did not include a candidate satisfying the requested shape; using catalog fallback"}, false
	}
	region, regionWarnings := resolveRegion(provider.RegionPreferences, options.Region)
	price := hcloudHourlyGross(selected, region)
	if price == "" {
		for _, preferredRegion := range provider.RegionPreferences {
			if price = hcloudHourlyGross(selected, preferredRegion); price != "" {
				region = preferredRegion
				break
			}
		}
	}
	diskGB := resolveDiskGB(shape, provisionCatalogMapping{}, options.DiskGB)
	cost := provisionResolvedCost{
		Kind:        "unknown",
		PricingURL:  provider.PricingURL,
		Description: "hcloud did not return hourly pricing for the selected region",
	}
	if price != "" {
		cost = provisionResolvedCost{
			Kind:        "live_hourly",
			Amount:      price,
			Currency:    "EUR",
			PricingURL:  provider.PricingURL,
			Description: "gross hourly price returned by hcloud for the selected server type and region",
		}
	}
	candidate := provisionResolvedCandidate{
		Provider:      provider.ID,
		DisplayName:   provider.DisplayName,
		Shape:         shape.ID,
		Source:        "live_cli",
		InstanceType:  selected.Name,
		Region:        region,
		RegionOptions: provider.RegionPreferences,
		DiskGB:        diskGB,
		Machine: provisionResolvedMachine{
			CPUs:     selected.Cores,
			MemoryGB: int(math.Ceil(selected.Memory)),
			DiskGB:   selected.Disk,
		},
		ImageSelector: provider.ImageSelector,
		Cost:          cost,
		Approval: provisionResolutionApproval{
			RequiresMutationApproval: true,
			CommandPreview:           nil,
			SecretFree:               true,
		},
		Warnings: regionWarnings,
	}
	return candidate, regionWarnings, true
}

func chooseHcloudServerType(serverTypes []hcloudServerType, shape provisionCatalogShape, constraints provisionResolveConstraints) (hcloudServerType, bool) {
	cpuMin := maxInt(shape.CPUMin, constraints.CPUMin)
	memoryMin := maxInt(shape.MemoryGBMin, constraints.MemoryGBMin)
	var selected hcloudServerType
	for _, serverType := range serverTypes {
		if serverType.Name == "" || serverType.Cores < cpuMin || int(math.Floor(serverType.Memory)) < memoryMin {
			continue
		}
		if selected.Name == "" || compareHcloudServerTypes(serverType, selected) < 0 {
			selected = serverType
		}
	}
	return selected, selected.Name != ""
}

func resolveAWSLiveCandidate(ctx context.Context, provider provisionCatalogProvider, shape provisionCatalogShape, mapping provisionCatalogMapping, constraints provisionResolveConstraints, options provisionResolveOptions, deps cliDeps) (provisionResolvedCandidate, []string, bool) {
	if _, err := deps.lookPath(provider.CLI.Binary); err != nil {
		return provisionResolvedCandidate{}, []string{"aws CLI was not found; using catalog fallback"}, false
	}
	region, regionWarnings, ok := resolveAWSOfferingRegion(ctx, provider, mapping.InstanceType, options.Region, deps)
	if !ok {
		return provisionResolvedCandidate{}, regionWarnings, false
	}
	output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, []string{"ec2", "describe-instance-types", "--instance-types", mapping.InstanceType, "--region", region, "--output", "json"})
	if err != nil {
		return provisionResolvedCandidate{}, []string{liveResolveFailureWarning("aws", "instance-type", output, err)}, false
	}
	var result awsDescribeInstanceTypesResult
	if err := json.Unmarshal(output, &result); err != nil {
		return provisionResolvedCandidate{}, []string{"aws live instance-type output could not be parsed; using catalog fallback"}, false
	}
	selected, ok := chooseAWSInstanceType(result.InstanceTypes, mapping.InstanceType, shape, constraints)
	if !ok {
		return provisionResolvedCandidate{}, []string{"aws live instance-type output did not include a candidate satisfying the requested shape; using catalog fallback"}, false
	}
	diskGB := resolveDiskGB(shape, mapping, options.DiskGB)
	placement, placementWarnings := resolveAWSPlacement(ctx, provider, region, options.AWSPlacement, deps)
	warnings := append(regionWarnings, placementWarnings...)
	candidate := provisionResolvedCandidate{
		Provider:      provider.ID,
		DisplayName:   provider.DisplayName,
		Shape:         shape.ID,
		Source:        "live_cli",
		InstanceType:  selected.InstanceType,
		Region:        region,
		RegionOptions: provider.RegionPreferences,
		AWSPlacement:  placement,
		DiskGB:        diskGB,
		Machine: provisionResolvedMachine{
			CPUs:     selected.VCpuInfo.DefaultVCpus,
			MemoryGB: memoryGBFromMiB(selected.MemoryInfo.SizeInMiB),
			GPUClass: firstNonEmpty(mapping.GPUClass, shape.GPUClass),
			DiskGB:   diskGB,
		},
		ImageSelector: provider.ImageSelector,
		Cost: provisionResolvedCost{
			Kind:        "unknown",
			PricingURL:  provider.PricingURL,
			Description: "AWS CLI did not return on-demand pricing for the selected instance type",
		},
		Approval: provisionResolutionApproval{
			RequiresMutationApproval: true,
			CommandPreview:           nil,
			SecretFree:               true,
		},
		Warnings: warnings,
	}
	return candidate, warnings, true
}

func resolveAWSOfferingRegion(ctx context.Context, provider provisionCatalogProvider, instanceType string, requestedRegion string, deps cliDeps) (string, []string, bool) {
	warnings := make([]string, 0)
	if _, regionWarnings := resolveRegion(provider.RegionPreferences, requestedRegion); len(regionWarnings) > 0 {
		warnings = append(warnings, regionWarnings...)
	}
	for _, region := range liveRegionCandidates(provider.RegionPreferences, requestedRegion) {
		output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, []string{"ec2", "describe-instance-type-offerings", "--filters", "Name=instance-type,Values=" + instanceType, "--region", region, "--output", "json"})
		if err != nil {
			warnings = append(warnings, liveResolveFailureWarning("aws", "instance-type offering", output, err))
			continue
		}
		var result awsDescribeInstanceTypeOfferingsResult
		if err := json.Unmarshal(output, &result); err != nil {
			warnings = append(warnings, "aws live instance-type offering output could not be parsed; using catalog fallback")
			continue
		}
		if awsOfferingsInclude(result.InstanceTypeOfferings, instanceType) {
			return region, warnings, true
		}
		warnings = append(warnings, fmt.Sprintf("aws live instance-type offering output did not include %s in %s", instanceType, region))
	}
	if len(warnings) == 0 {
		warnings = append(warnings, "aws live instance-type offering output did not include a preferred region; using catalog fallback")
	}
	return "", warnings, false
}

func chooseAWSInstanceType(instanceTypes []awsInstanceType, expected string, shape provisionCatalogShape, constraints provisionResolveConstraints) (awsInstanceType, bool) {
	cpuMin := maxInt(shape.CPUMin, constraints.CPUMin)
	memoryMin := maxInt(shape.MemoryGBMin, constraints.MemoryGBMin)
	needsGPU := gpuIsRequired(shape, constraints)
	for _, instanceType := range instanceTypes {
		if instanceType.InstanceType != expected {
			continue
		}
		if instanceType.VCpuInfo.DefaultVCpus < cpuMin || memoryGBFromMiB(instanceType.MemoryInfo.SizeInMiB) < memoryMin {
			continue
		}
		if needsGPU && awsGPUCount(instanceType.GPUInfo) == 0 {
			continue
		}
		return instanceType, true
	}
	return awsInstanceType{}, false
}

func awsOfferingsInclude(offerings []awsInstanceTypeOffering, instanceType string) bool {
	for _, offering := range offerings {
		if offering.InstanceType == instanceType {
			return true
		}
	}
	return false
}

func awsGPUCount(info awsGPUInfo) int {
	total := 0
	for _, gpu := range info.GPUs {
		total += gpu.Count
	}
	return total
}

func gpuIsRequired(shape provisionCatalogShape, constraints provisionResolveConstraints) bool {
	gpuClass := firstNonEmpty(constraints.GPUClass, shape.GPUClass)
	return gpuClass != "" && gpuClass != "none"
}

func resolveGCPLiveCandidate(ctx context.Context, provider provisionCatalogProvider, shape provisionCatalogShape, mapping provisionCatalogMapping, constraints provisionResolveConstraints, options provisionResolveOptions, deps cliDeps) (provisionResolvedCandidate, []string, bool) {
	if _, err := deps.lookPath(provider.CLI.Binary); err != nil {
		return provisionResolvedCandidate{}, []string{"gcloud CLI was not found; using catalog fallback"}, false
	}
	output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, []string{"compute", "machine-types", "list", "--filter=name=" + mapping.InstanceType, "--format=json(name,guestCpus,memoryMb,zone,selfLink)"})
	if err != nil {
		return provisionResolvedCandidate{}, []string{liveResolveFailureWarning("gcloud", "machine-type", output, err)}, false
	}
	var machineTypes []gcpMachineType
	if err := json.Unmarshal(output, &machineTypes); err != nil {
		return provisionResolvedCandidate{}, []string{"gcloud live machine-type output could not be parsed; using catalog fallback"}, false
	}
	selected, region, ok := chooseGCPMachineType(machineTypes, mapping.InstanceType, provider.RegionPreferences, options.Region, shape, constraints)
	if !ok {
		return provisionResolvedCandidate{}, []string{"gcloud live machine-type output did not include a candidate satisfying the requested shape and region; using catalog fallback"}, false
	}
	_, regionWarnings := resolveRegion(provider.RegionPreferences, options.Region)
	diskGB := resolveDiskGB(shape, mapping, options.DiskGB)
	candidate := provisionResolvedCandidate{
		Provider:      provider.ID,
		DisplayName:   provider.DisplayName,
		Shape:         shape.ID,
		Source:        "live_cli",
		InstanceType:  selected.Name,
		Region:        region,
		RegionOptions: provider.RegionPreferences,
		DiskGB:        diskGB,
		Machine: provisionResolvedMachine{
			CPUs:     selected.GuestCPU,
			MemoryGB: memoryGBFromMiB(selected.MemoryMB),
			GPUClass: firstNonEmpty(mapping.GPUClass, shape.GPUClass),
			DiskGB:   diskGB,
		},
		ImageSelector: provider.ImageSelector,
		Cost: provisionResolvedCost{
			Kind:        "unknown",
			PricingURL:  provider.PricingURL,
			Description: "gcloud did not return pricing for the selected machine type",
		},
		Approval: provisionResolutionApproval{
			RequiresMutationApproval: true,
			CommandPreview:           nil,
			SecretFree:               true,
		},
		Warnings: regionWarnings,
	}
	return candidate, regionWarnings, true
}

func chooseGCPMachineType(machineTypes []gcpMachineType, expected string, regionPreferences []string, requestedRegion string, shape provisionCatalogShape, constraints provisionResolveConstraints) (gcpMachineType, string, bool) {
	cpuMin := maxInt(shape.CPUMin, constraints.CPUMin)
	memoryMin := maxInt(shape.MemoryGBMin, constraints.MemoryGBMin)
	for _, region := range liveRegionCandidates(regionPreferences, requestedRegion) {
		for _, machineType := range machineTypes {
			if machineType.Name != expected {
				continue
			}
			if machineType.GuestCPU < cpuMin || memoryGBFromMiB(machineType.MemoryMB) < memoryMin {
				continue
			}
			machineRegion := gcpMachineTypeRegion(machineType)
			if machineRegion == region {
				return machineType, machineRegion, true
			}
		}
	}
	return gcpMachineType{}, "", false
}

func gcpMachineTypeRegion(machineType gcpMachineType) string {
	if region := gcpRegionFromZone(machineType.Zone); region != "" {
		return region
	}
	return gcpRegionFromSelfLink(machineType.SelfLink)
}

func gcpRegionFromSelfLink(value string) string {
	const zonesSegment = "/zones/"
	index := strings.LastIndex(value, zonesSegment)
	if index < 0 {
		return ""
	}
	remainder := value[index+len(zonesSegment):]
	parts := strings.SplitN(remainder, "/", 2)
	return gcpRegionFromZone(parts[0])
}

func gcpRegionFromZone(value string) string {
	zone := pathBase(strings.TrimSpace(value))
	if zone == "" {
		return ""
	}
	index := strings.LastIndex(zone, "-")
	if index < 0 {
		return ""
	}
	return zone[:index]
}

func resolveDigitalOceanLiveCandidate(ctx context.Context, provider provisionCatalogProvider, shape provisionCatalogShape, constraints provisionResolveConstraints, options provisionResolveOptions, deps cliDeps) (provisionResolvedCandidate, []string, bool) {
	if _, err := deps.lookPath(provider.CLI.Binary); err != nil {
		return provisionResolvedCandidate{}, []string{"doctl CLI was not found; using catalog fallback"}, false
	}
	output, err := runProviderProbe(ctx, deps, provider.CLI.Binary, []string{"compute", "size", "list", "--output", "json"})
	if err != nil {
		return provisionResolvedCandidate{}, []string{liveResolveFailureWarning("doctl", "size", output, err)}, false
	}
	var sizes []digitalOceanSize
	if err := json.Unmarshal(output, &sizes); err != nil {
		return provisionResolvedCandidate{}, []string{"doctl live size output could not be parsed; using catalog fallback"}, false
	}
	selected, region, ok := chooseDigitalOceanSize(sizes, provider.RegionPreferences, options.Region, shape, constraints)
	if !ok {
		return provisionResolvedCandidate{}, []string{"doctl live size output did not include a candidate satisfying the requested shape, region, and disk floor; using catalog fallback"}, false
	}
	_, regionWarnings := resolveRegion(provider.RegionPreferences, options.Region)
	cost := provisionResolvedCost{
		Kind:        "unknown",
		PricingURL:  provider.PricingURL,
		Description: "doctl did not return hourly pricing for the selected size",
	}
	if selected.PriceHourly > 0 {
		cost = provisionResolvedCost{
			Kind:        "live_hourly",
			Amount:      strconv.FormatFloat(selected.PriceHourly, 'f', -1, 64),
			Currency:    "USD",
			PricingURL:  provider.PricingURL,
			Description: "hourly price returned by doctl for the selected Droplet size",
		}
	}
	candidate := provisionResolvedCandidate{
		Provider:      provider.ID,
		DisplayName:   provider.DisplayName,
		Shape:         shape.ID,
		Source:        "live_cli",
		InstanceType:  selected.Slug,
		Region:        region,
		RegionOptions: provider.RegionPreferences,
		DiskGB:        selected.DiskGB,
		Machine: provisionResolvedMachine{
			CPUs:     selected.VCPUs,
			MemoryGB: memoryGBFromMiB(selected.MemoryMB),
			DiskGB:   selected.DiskGB,
		},
		ImageSelector: provider.ImageSelector,
		Cost:          cost,
		Approval: provisionResolutionApproval{
			RequiresMutationApproval: true,
			CommandPreview:           nil,
			SecretFree:               true,
		},
		Warnings: regionWarnings,
	}
	return candidate, regionWarnings, true
}

func chooseDigitalOceanSize(sizes []digitalOceanSize, regionPreferences []string, requestedRegion string, shape provisionCatalogShape, constraints provisionResolveConstraints) (digitalOceanSize, string, bool) {
	cpuMin := maxInt(shape.CPUMin, constraints.CPUMin)
	memoryMin := maxInt(shape.MemoryGBMin, constraints.MemoryGBMin)
	diskMin := maxInt(shape.DiskFloorGB, constraints.DiskGB)
	for _, region := range liveRegionCandidates(regionPreferences, requestedRegion) {
		if selected, ok := chooseDigitalOceanSizeInRegion(sizes, region, cpuMin, memoryMin, diskMin); ok {
			return selected, region, true
		}
	}
	return digitalOceanSize{}, "", false
}

func chooseDigitalOceanSizeInRegion(sizes []digitalOceanSize, region string, cpuMin int, memoryMin int, diskMin int) (digitalOceanSize, bool) {
	var selected digitalOceanSize
	for _, size := range sizes {
		if !digitalOceanSizeSatisfies(size, region, cpuMin, memoryMin, diskMin) {
			continue
		}
		if selected.Slug == "" || compareDigitalOceanSizes(size, selected) < 0 {
			selected = size
		}
	}
	return selected, selected.Slug != ""
}

func digitalOceanSizeSatisfies(size digitalOceanSize, region string, cpuMin int, memoryMin int, diskMin int) bool {
	if size.Available != nil && !*size.Available {
		return false
	}
	return size.Slug != "" &&
		size.VCPUs >= cpuMin &&
		memoryGBFromMiB(size.MemoryMB) >= memoryMin &&
		size.DiskGB >= diskMin &&
		containsString(size.Regions, region)
}

func compareDigitalOceanSizes(left digitalOceanSize, right digitalOceanSize) int {
	if left.PriceHourly > 0 && right.PriceHourly > 0 && left.PriceHourly != right.PriceHourly {
		if left.PriceHourly < right.PriceHourly {
			return -1
		}
		return 1
	}
	if left.VCPUs != right.VCPUs {
		return left.VCPUs - right.VCPUs
	}
	if left.MemoryMB != right.MemoryMB {
		return left.MemoryMB - right.MemoryMB
	}
	if left.DiskGB != right.DiskGB {
		return left.DiskGB - right.DiskGB
	}
	return strings.Compare(left.Slug, right.Slug)
}

func compareHcloudServerTypes(left hcloudServerType, right hcloudServerType) int {
	leftPrice := lowestHcloudHourlyGross(left)
	rightPrice := lowestHcloudHourlyGross(right)
	if leftPrice != "" && rightPrice != "" {
		leftFloat, leftErr := strconv.ParseFloat(leftPrice, 64)
		rightFloat, rightErr := strconv.ParseFloat(rightPrice, 64)
		if leftErr == nil && rightErr == nil && leftFloat != rightFloat {
			if leftFloat < rightFloat {
				return -1
			}
			return 1
		}
	}
	if left.Cores != right.Cores {
		return left.Cores - right.Cores
	}
	if left.Memory != right.Memory {
		if left.Memory < right.Memory {
			return -1
		}
		return 1
	}
	return strings.Compare(left.Name, right.Name)
}

func lowestHcloudHourlyGross(serverType hcloudServerType) string {
	lowest := ""
	for _, price := range serverType.Prices {
		gross := strings.TrimSpace(price.PriceHourly.Gross)
		if gross == "" {
			continue
		}
		if lowest == "" {
			lowest = gross
			continue
		}
		grossFloat, grossErr := strconv.ParseFloat(gross, 64)
		lowestFloat, lowestErr := strconv.ParseFloat(lowest, 64)
		if grossErr == nil && lowestErr == nil && grossFloat < lowestFloat {
			lowest = gross
		}
	}
	return lowest
}

func hcloudHourlyGross(serverType hcloudServerType, region string) string {
	for _, price := range serverType.Prices {
		if price.Location == region {
			return strings.TrimSpace(price.PriceHourly.Gross)
		}
	}
	return ""
}

func resolveRegion(preferences []string, requested string) (string, []string) {
	if requested == "" {
		return preferences[0], nil
	}
	for _, preference := range preferences {
		if requested == preference {
			return requested, nil
		}
	}
	return requested, []string{"requested region is outside the fallback catalog preference list"}
}

func liveRegionCandidates(preferences []string, requested string) []string {
	if requested != "" {
		return []string{requested}
	}
	return preferences
}

func resolveDiskGB(shape provisionCatalogShape, mapping provisionCatalogMapping, requested int) int {
	diskGB := shape.DiskFloorGB
	if mapping.DiskGB > diskGB {
		diskGB = mapping.DiskGB
	}
	if requested > diskGB {
		return requested
	}
	return diskGB
}

func liveResolveFailureWarning(cliBinary string, probe string, output []byte, err error) string {
	if isCommandNotFound(err) {
		return cliBinary + " CLI was not found; using catalog fallback"
	}
	warning := cliBinary + " live " + probe + " probe failed; using catalog fallback"
	if trimmed := trimCommandOutput(output); trimmed != "" {
		warning += ": " + trimmed
	}
	return warning
}

func memoryGBFromMiB(value int) int {
	if value <= 0 {
		return 0
	}
	return int(math.Ceil(float64(value) / 1024))
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func pathBase(value string) string {
	value = strings.TrimSuffix(value, "/")
	index := strings.LastIndex(value, "/")
	if index < 0 {
		return value
	}
	return value[index+1:]
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
