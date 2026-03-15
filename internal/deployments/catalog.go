package deployments

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

var (
	ErrCatalogRootRequired               = errors.New("deployment catalog root is required")
	ErrCatalogRequired                   = errors.New("deployment catalog is required")
	ErrDeploymentNameSingleSegment       = errors.New("deployment name must be a single path segment")
	ErrDeploymentNameReserved            = errors.New("deployment name must not be '.' or '..'")
	ErrDeploymentNotFound                = errors.New("deployment was not found")
	ErrDeploymentVersionAllocationFailed = errors.New("deployment version allocation failed")
)

type Catalog struct {
	root string
}

type CatalogOptions struct {
	Root string
}

type Metadata struct {
	DeploymentName      string    `json:"deploymentName"`
	DeploymentVersion   string    `json:"deploymentVersion"`
	DeploymentType      Type      `json:"deploymentType"`
	DefaultProjectID    string    `json:"defaultProjectConfigId"`
	DefaultProjectName  string    `json:"defaultProjectConfigName"`
	CreatedAt           time.Time `json:"createdAt"`
	DeploymentRoot      string    `json:"deploymentRoot"`
	PolicyPath          string    `json:"policyPath"`
	DeploymentVersionNo int       `json:"-"`
}

type Allocation struct {
	DeploymentName    string `json:"deploymentName"`
	DeploymentVersion string `json:"deploymentVersion"`
	DeploymentRoot    string `json:"deploymentRoot"`
}

func DefaultCatalogRoot(settaFilesRoot string) (string, error) {
	resolvedSettaFilesRoot, err := statefs.NormalizePath(strings.TrimSpace(settaFilesRoot), "")
	if err != nil {
		return "", fmt.Errorf("resolve setta_files root: %w", err)
	}
	return statefs.NormalizePath(filepath.Join(resolvedSettaFilesRoot, "deployments"), "")
}

func NewCatalog(opts CatalogOptions) (*Catalog, error) {
	root := strings.TrimSpace(opts.Root)
	if root == "" {
		return nil, ErrCatalogRootRequired
	}
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return nil, fmt.Errorf("resolve deployment catalog root: %w", err)
	}
	return &Catalog{root: resolvedRoot}, nil
}

func NormalizeDeploymentName(name string) (string, error) {
	normalized := strings.TrimSpace(name)
	if normalized == "" {
		return "", ErrDeploymentNameRequired
	}
	if normalized == "." || normalized == ".." {
		return "", ErrDeploymentNameReserved
	}
	if strings.ContainsAny(normalized, `/\`) {
		return "", ErrDeploymentNameSingleSegment
	}
	return normalized, nil
}

func (c *Catalog) Root() string {
	if c == nil {
		return ""
	}
	return c.root
}

func (c *Catalog) Allocate(deploymentName string) (Allocation, error) {
	if c == nil {
		return Allocation{}, ErrCatalogRequired
	}

	normalizedName, err := NormalizeDeploymentName(deploymentName)
	if err != nil {
		return Allocation{}, err
	}

	deploymentParent := filepath.Join(c.root, normalizedName)
	if err := os.MkdirAll(deploymentParent, 0o755); err != nil {
		return Allocation{}, fmt.Errorf("create deployment parent: %w", err)
	}

	for attempts := 0; attempts < 1024; attempts++ {
		versions, err := listVersionRoots(deploymentParent)
		if err != nil {
			return Allocation{}, err
		}
		nextNumber := 1
		if len(versions) != 0 {
			nextNumber = versions[len(versions)-1].Number + 1
		}
		deploymentVersion := fmt.Sprintf("v%d", nextNumber)
		deploymentRoot := filepath.Join(deploymentParent, deploymentVersion)
		if err := os.Mkdir(deploymentRoot, 0o755); err != nil {
			if os.IsExist(err) {
				continue
			}
			return Allocation{}, fmt.Errorf("create deployment root: %w", err)
		}
		resolvedRoot, err := statefs.NormalizePath(deploymentRoot, "")
		if err != nil {
			return Allocation{}, fmt.Errorf("resolve deployment root: %w", err)
		}
		return Allocation{
			DeploymentName:    normalizedName,
			DeploymentVersion: deploymentVersion,
			DeploymentRoot:    resolvedRoot,
		}, nil
	}

	return Allocation{}, ErrDeploymentVersionAllocationFailed
}

func (c *Catalog) List(ctx context.Context, deploymentType Type) ([]Metadata, error) {
	if c == nil {
		return nil, ErrCatalogRequired
	}
	if err := validateDeploymentType(deploymentType); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(c.root)
	if err != nil {
		if os.IsNotExist(err) {
			return []Metadata{}, nil
		}
		return nil, fmt.Errorf("read deployments root: %w", err)
	}

	metadata := []Metadata{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		versions, err := c.ListVersions(ctx, entry.Name(), deploymentType)
		if err != nil {
			return nil, err
		}
		metadata = append(metadata, versions...)
	}

	sort.Slice(metadata, func(i int, j int) bool {
		if !metadata[i].CreatedAt.Equal(metadata[j].CreatedAt) {
			return metadata[i].CreatedAt.After(metadata[j].CreatedAt)
		}
		if metadata[i].DeploymentName != metadata[j].DeploymentName {
			return metadata[i].DeploymentName < metadata[j].DeploymentName
		}
		if metadata[i].DeploymentVersionNo != metadata[j].DeploymentVersionNo {
			return metadata[i].DeploymentVersionNo > metadata[j].DeploymentVersionNo
		}
		return metadata[i].DeploymentVersion < metadata[j].DeploymentVersion
	})

	return metadata, nil
}

func (c *Catalog) ListVersions(ctx context.Context, deploymentName string, deploymentType Type) ([]Metadata, error) {
	if c == nil {
		return nil, ErrCatalogRequired
	}
	if err := validateDeploymentType(deploymentType); err != nil {
		return nil, err
	}

	normalizedName, err := NormalizeDeploymentName(deploymentName)
	if err != nil {
		return nil, err
	}

	deploymentParent := filepath.Join(c.root, normalizedName)
	versions, err := listVersionRoots(deploymentParent)
	if err != nil {
		if os.IsNotExist(err) {
			return []Metadata{}, nil
		}
		return nil, err
	}
	sort.Slice(versions, func(i int, j int) bool {
		return versions[i].Number > versions[j].Number
	})

	metadata := []Metadata{}
	for _, version := range versions {
		entry, ok, err := loadDeploymentMetadata(ctx, version.Root, deploymentType)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		metadata = append(metadata, entry)
	}

	return metadata, nil
}

func (c *Catalog) Latest(ctx context.Context, deploymentName string, deploymentType Type) (Metadata, error) {
	if c == nil {
		return Metadata{}, ErrCatalogRequired
	}
	if err := validateDeploymentType(deploymentType); err != nil {
		return Metadata{}, err
	}

	normalizedName, err := NormalizeDeploymentName(deploymentName)
	if err != nil {
		return Metadata{}, err
	}

	deploymentParent := filepath.Join(c.root, normalizedName)
	versions, err := listVersionRoots(deploymentParent)
	if err != nil {
		if os.IsNotExist(err) {
			return Metadata{}, fmt.Errorf("%w: %q", ErrDeploymentNotFound, normalizedName)
		}
		return Metadata{}, err
	}
	if len(versions) == 0 {
		return Metadata{}, fmt.Errorf("%w: %q", ErrDeploymentNotFound, normalizedName)
	}
	sort.Slice(versions, func(i int, j int) bool {
		return versions[i].Number > versions[j].Number
	})

	entry, ok, err := loadDeploymentMetadata(ctx, versions[0].Root, deploymentType)
	if err != nil {
		return Metadata{}, err
	}
	if !ok {
		return Metadata{}, fmt.Errorf("%w: %q", ErrDeploymentNotFound, normalizedName)
	}
	return entry, nil
}

type versionRoot struct {
	Number int
	Root   string
}

func listVersionRoots(deploymentParent string) ([]versionRoot, error) {
	entries, err := os.ReadDir(deploymentParent)
	if err != nil {
		return nil, fmt.Errorf("read deployment parent: %w", err)
	}

	versions := make([]versionRoot, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		versionNumber, ok := parseDeploymentVersion(entry.Name())
		if !ok {
			continue
		}
		versions = append(versions, versionRoot{
			Number: versionNumber,
			Root:   filepath.Join(deploymentParent, entry.Name()),
		})
	}
	sort.Slice(versions, func(i int, j int) bool {
		return versions[i].Number < versions[j].Number
	})
	return versions, nil
}

func parseDeploymentVersion(value string) (int, bool) {
	if !strings.HasPrefix(value, "v") {
		return 0, false
	}
	number, err := strconv.Atoi(value[1:])
	if err != nil || number <= 0 {
		return 0, false
	}
	return number, true
}

func validateDeploymentType(deploymentType Type) error {
	switch deploymentType {
	case TypeShare, TypeApp:
		return nil
	case "":
		return ErrDeploymentTypeRequired
	default:
		return fmt.Errorf("%w: %q", ErrUnsupportedDeploymentType, deploymentType)
	}
}

func loadDeploymentMetadata(ctx context.Context, deploymentRoot string, deploymentType Type) (Metadata, bool, error) {
	manifest, ok, err := loadManifestOptional(deploymentRoot)
	if err != nil {
		return Metadata{}, false, err
	}
	if !ok {
		return Metadata{}, false, nil
	}
	if manifest.DeploymentType != deploymentType {
		return Metadata{}, false, nil
	}
	if !manifestMatchesRoot(manifest, deploymentRoot) {
		return Metadata{}, false, nil
	}

	defaultProjectName, ok, err := loadDefaultProjectName(ctx, deploymentRoot, manifest.DefaultProjectID)
	if err != nil {
		return Metadata{}, false, err
	}
	if !ok {
		return Metadata{}, false, nil
	}

	resolvedRoot, err := statefs.NormalizePath(deploymentRoot, "")
	if err != nil {
		return Metadata{}, false, fmt.Errorf("resolve deployment root: %w", err)
	}
	versionNumber, _ := parseDeploymentVersion(manifest.DeploymentVersion)
	return Metadata{
		DeploymentName:      manifest.DeploymentName,
		DeploymentVersion:   manifest.DeploymentVersion,
		DeploymentType:      manifest.DeploymentType,
		DefaultProjectID:    manifest.DefaultProjectID,
		DefaultProjectName:  defaultProjectName,
		CreatedAt:           manifest.CreatedAt,
		DeploymentRoot:      resolvedRoot,
		PolicyPath:          filepath.Join(resolvedRoot, "policy.json"),
		DeploymentVersionNo: versionNumber,
	}, true, nil
}

func loadManifestOptional(deploymentRoot string) (Manifest, bool, error) {
	manifest, err := LoadManifest(deploymentRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) || isSkippableManifestError(err) {
			return Manifest{}, false, nil
		}
		return Manifest{}, false, err
	}
	return manifest, true, nil
}

func isSkippableManifestError(err error) bool {
	return errors.Is(err, ErrManifestVersionRequired) ||
		errors.Is(err, ErrDeploymentNameRequired) ||
		errors.Is(err, ErrDeploymentTypeRequired) ||
		errors.Is(err, ErrUnsupportedDeploymentType) ||
		errors.Is(err, ErrDefaultProjectIDRequired) ||
		errors.Is(err, ErrDeploymentVersionRequired) ||
		errors.Is(err, ErrListenerEntrypointRequired) ||
		errors.Is(err, ErrCreatedAtInvalid)
}

func loadDefaultProjectName(ctx context.Context, deploymentRoot string, defaultProjectID string) (string, bool, error) {
	projectPath := filepath.Join(deploymentRoot, projectstate.MainFileName)
	if _, err := os.Stat(projectPath); err != nil {
		return "", false, fmt.Errorf("stat deployment project document: %w", err)
	}

	store, err := projectstate.NewStore(projectPath, projectstate.StoreOptions{})
	if err != nil {
		return "", false, fmt.Errorf("open deployment project store: %w", err)
	}
	document, err := store.Load(ctx)
	if err != nil {
		return "", false, fmt.Errorf("load deployment project document: %w", err)
	}
	project, err := document.ProjectByID(defaultProjectID)
	if err != nil {
		return "", false, nil
	}
	return project.Name, true, nil
}

func manifestMatchesRoot(manifest Manifest, deploymentRoot string) bool {
	return manifest.DeploymentName == filepath.Base(filepath.Dir(deploymentRoot)) &&
		manifest.DeploymentVersion == filepath.Base(deploymentRoot)
}
