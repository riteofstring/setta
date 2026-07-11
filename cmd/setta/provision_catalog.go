package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

//go:embed provision_catalog.json
var provisionCatalogJSON []byte

type provisionCatalog struct {
	SchemaVersion   int                        `json:"schemaVersion"`
	DefaultProvider string                     `json:"defaultProvider"`
	Shapes          []provisionCatalogShape    `json:"shapes"`
	Providers       []provisionCatalogProvider `json:"providers"`
}

type provisionCatalogShape struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Guide       string `json:"guide"`
	CPUMin      int    `json:"cpuMin"`
	MemoryGBMin int    `json:"memoryGbMin"`
	GPUClass    string `json:"gpuClass,omitempty"`
	DiskFloorGB int    `json:"diskFloorGb"`
}

type provisionCatalogProvider struct {
	ID                string                             `json:"id"`
	DisplayName       string                             `json:"displayName"`
	PricingURL        string                             `json:"pricingUrl"`
	CLI               *provisionCatalogCLI               `json:"cli,omitempty"`
	RegionPreferences []string                           `json:"regionPreferences"`
	ImageSelector     provisionCatalogImageSelector      `json:"imageSelector"`
	Mappings          map[string]provisionCatalogMapping `json:"mappings"`
}

type provisionCatalogCLI struct {
	Binary          string   `json:"binary"`
	VersionArgs     []string `json:"versionArgs"`
	AuthProbeArgs   []string `json:"authProbeArgs"`
	LiveResolveArgs []string `json:"liveResolveArgs,omitempty"`
}

type provisionCatalogImageSelector struct {
	Kind        string `json:"kind"`
	Value       string `json:"value"`
	Description string `json:"description"`
}

type provisionCatalogMapping struct {
	InstanceType string `json:"instanceType"`
	CostClass    string `json:"costClass"`
	GPUClass     string `json:"gpuClass,omitempty"`
	DiskGB       int    `json:"diskGb,omitempty"`
}

type provisionShapesResult struct {
	OK           bool             `json:"ok"`
	DefaultShape string           `json:"defaultShape"`
	Catalog      provisionCatalog `json:"catalog"`
}

func runProvisionShapes(args []string, deps cliDeps) error {
	options, err := provisionShapesOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	_ = options
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return err
	}
	return encodeProvisionJSON(deps, provisionShapesResult{OK: true, DefaultShape: defaultProvisionShape, Catalog: catalog}, "shapes JSON")
}

type provisionShapesOptions struct {
	JSON bool
}

func provisionShapesOptionsFromArgs(args []string, deps cliDeps) (provisionShapesOptions, error) {
	options := provisionShapesOptions{}
	flagSet := newFlagSet("setta provision shapes", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	if err := flagSet.Parse(args); err != nil {
		return provisionShapesOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionShapesOptions{}, usageError{err: errors.New("setta provision shapes does not accept positional arguments")}
	}
	if !options.JSON {
		return provisionShapesOptions{}, usageError{err: errors.New("setta provision shapes requires --json")}
	}
	return options, nil
}

func loadProvisionCatalog() (provisionCatalog, error) {
	var catalog provisionCatalog
	if err := json.Unmarshal(provisionCatalogJSON, &catalog); err != nil {
		return provisionCatalog{}, fmt.Errorf("parse provision catalog: %w", err)
	}
	if err := validateProvisionCatalog(catalog); err != nil {
		return provisionCatalog{}, err
	}
	return catalog, nil
}

func validateProvisionCatalog(catalog provisionCatalog) error {
	if catalog.SchemaVersion != 1 {
		return fmt.Errorf("provision catalog schemaVersion = %d, want 1", catalog.SchemaVersion)
	}
	shapeIDs := make(map[string]provisionCatalogShape, len(catalog.Shapes))
	for _, shape := range catalog.Shapes {
		if err := validateProvisionCatalogShape(shape, shapeIDs); err != nil {
			return err
		}
		shapeIDs[shape.ID] = shape
	}
	if _, ok := shapeIDs[defaultProvisionShape]; !ok {
		return fmt.Errorf("provision catalog missing default shape %q", defaultProvisionShape)
	}
	providerIDs := make(map[string]struct{}, len(catalog.Providers))
	for _, provider := range catalog.Providers {
		if err := validateProvisionCatalogProvider(provider, providerIDs, shapeIDs); err != nil {
			return err
		}
		providerIDs[provider.ID] = struct{}{}
	}
	if _, ok := providerIDs[catalog.DefaultProvider]; !ok {
		return fmt.Errorf("provision catalog defaultProvider %q is not a provider", catalog.DefaultProvider)
	}
	return nil
}

func validateProvisionCatalogShape(shape provisionCatalogShape, existing map[string]provisionCatalogShape) error {
	if strings.TrimSpace(shape.ID) == "" {
		return errors.New("provision catalog shape id is required")
	}
	if _, exists := existing[shape.ID]; exists {
		return fmt.Errorf("provision catalog duplicate shape %q", shape.ID)
	}
	if shape.CPUMin <= 0 || shape.MemoryGBMin <= 0 || shape.DiskFloorGB <= 0 {
		return fmt.Errorf("provision catalog shape %q has invalid resource floors", shape.ID)
	}
	return nil
}

func validateProvisionCatalogProvider(provider provisionCatalogProvider, existing map[string]struct{}, shapeIDs map[string]provisionCatalogShape) error {
	if strings.TrimSpace(provider.ID) == "" {
		return errors.New("provision catalog provider id is required")
	}
	if _, exists := existing[provider.ID]; exists {
		return fmt.Errorf("provision catalog duplicate provider %q", provider.ID)
	}
	if strings.TrimSpace(provider.DisplayName) == "" {
		return fmt.Errorf("provision catalog provider %q missing display name", provider.ID)
	}
	if len(provider.RegionPreferences) == 0 {
		return fmt.Errorf("provision catalog provider %q missing region preferences", provider.ID)
	}
	if strings.TrimSpace(provider.ImageSelector.Kind) == "" || strings.TrimSpace(provider.ImageSelector.Value) == "" {
		return fmt.Errorf("provision catalog provider %q missing image selector", provider.ID)
	}
	return validateProvisionCatalogMappings(provider, shapeIDs)
}

func validateProvisionCatalogMappings(provider provisionCatalogProvider, shapeIDs map[string]provisionCatalogShape) error {
	if len(provider.Mappings) == 0 {
		return fmt.Errorf("provision catalog provider %q missing shape mappings", provider.ID)
	}
	for shapeID, mapping := range provider.Mappings {
		if _, ok := shapeIDs[shapeID]; !ok {
			return fmt.Errorf("provision catalog provider %q maps unknown shape %q", provider.ID, shapeID)
		}
		if strings.TrimSpace(mapping.InstanceType) == "" {
			return fmt.Errorf("provision catalog provider %q shape %q missing instance type", provider.ID, shapeID)
		}
		if strings.TrimSpace(mapping.CostClass) == "" {
			return fmt.Errorf("provision catalog provider %q shape %q missing cost class", provider.ID, shapeID)
		}
	}
	return nil
}

func provisionCatalogShapeByID(catalog provisionCatalog, shapeID string) (provisionCatalogShape, bool) {
	for _, shape := range catalog.Shapes {
		if shape.ID == shapeID {
			return shape, true
		}
	}
	return provisionCatalogShape{}, false
}

func provisionCatalogProviderByID(catalog provisionCatalog, providerID string) (provisionCatalogProvider, bool) {
	for _, provider := range catalog.Providers {
		if provider.ID == providerID {
			return provider, true
		}
	}
	return provisionCatalogProvider{}, false
}

func provisionCatalogDiskFloorGB(shapeID string) (int, bool) {
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return 0, false
	}
	shape, ok := provisionCatalogShapeByID(catalog, shapeID)
	if !ok {
		return 0, false
	}
	return shape.DiskFloorGB, true
}
