package plugins

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/pythonenv"
	"setta/internal/statefs"
)

const (
	packageManagerSourceHint       = "Managed by Python package manager in active environment. Use uv/pip/Poetry to install, update, or remove."
	packageManagerDiscoveryTimeout = 30 * time.Second
	ambiguousPluginRootErrorCode   = "PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT"
	invalidPluginManifestErrorCode = "PLUGIN_MANIFEST_INVALID"
)

func (s *DiscoveryService) discoverPackageManagerPlugins() ([]DiscoveredPlugin, error) {
	if !s.packageManagerDiscoveryEnabled() {
		return nil, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), packageManagerDiscoveryTimeout)
	defer cancel()

	distributions, err := s.packageManagerRuntime.PluginDistributions(ctx, s.packageManagerSearchPaths)
	if err != nil {
		return nil, err
	}
	return buildPackageManagerDiscoveredPlugins(distributions)
}

func (s *DiscoveryService) packageManagerDiscoveryEnabled() bool {
	return s != nil && !s.deploymentScoped && s.packageManagerRuntime != nil
}

func buildPackageManagerDiscoveredPlugins(distributions []pythonenv.PluginDistribution) ([]DiscoveredPlugin, error) {
	entries := make([]DiscoveredPlugin, 0, len(distributions))
	seenRoots := map[string]struct{}{}
	for _, distribution := range distributions {
		entry, include, err := buildPackageManagerDiscoveredPlugin(distribution, seenRoots)
		if err != nil {
			return nil, err
		}
		if !include {
			continue
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

type packageManagerDistributionMetadata struct {
	distributionName   string
	normalizedName     string
	version            string
	canonicalSourceKey string
}

func buildPackageManagerDiscoveredPlugin(
	distribution pythonenv.PluginDistribution,
	seenRoots map[string]struct{},
) (DiscoveredPlugin, bool, error) {
	manifestPaths, err := normalizePackageManagerManifestPaths(distribution.ManifestPaths)
	if err != nil {
		return DiscoveredPlugin{}, false, err
	}
	if len(manifestPaths) == 0 {
		return DiscoveredPlugin{}, false, nil
	}

	metadata := newPackageManagerDistributionMetadata(distribution)
	if len(manifestPaths) > 1 {
		return metadata.invalidPlugin(
			filepath.Dir(manifestPaths[0]),
			PluginErrorInfo{
				Code: ambiguousPluginRootErrorCode,
				Message: fmt.Sprintf(
					"Environment distribution contained multiple setta.plugin.json files: %s",
					packageManagerDistributionLabel(metadata.distributionName),
				),
			},
		), true, nil
	}

	pluginRoot := filepath.Dir(manifestPaths[0])
	if !claimPackageManagerRoot(seenRoots, pluginRoot) {
		return DiscoveredPlugin{}, false, nil
	}

	manifest, err := loadValidatedPackageManagerManifest(pluginRoot, manifestPaths[0])
	if err != nil {
		return metadata.invalidPlugin(
			pluginRoot,
			PluginErrorInfo{
				Code:    invalidPluginManifestErrorCode,
				Message: err.Error(),
			},
		), true, nil
	}

	digest, err := computeDirectoryDigest(pluginRoot)
	if err != nil {
		return DiscoveredPlugin{}, false, err
	}
	return metadata.discoveredPlugin(pluginRoot, manifest, digest), true, nil
}

func normalizePackageManagerManifestPaths(manifestPaths []string) ([]string, error) {
	values := make([]string, 0, len(manifestPaths))
	for _, manifestPath := range manifestPaths {
		normalizedManifestPath, err := statefs.NormalizePath(manifestPath, "")
		if err != nil {
			return nil, err
		}
		values = append(values, normalizedManifestPath)
	}
	return values, nil
}

func claimPackageManagerRoot(seenRoots map[string]struct{}, pluginRoot string) bool {
	if _, ok := seenRoots[pluginRoot]; ok {
		return false
	}
	seenRoots[pluginRoot] = struct{}{}
	return true
}

func loadValidatedPackageManagerManifest(pluginRoot string, manifestPath string) (PluginManifest, error) {
	manifest, err := loadPluginManifestFile(manifestPath)
	if err != nil {
		return PluginManifest{}, err
	}
	if err := ValidatePluginManifestPaths(pluginRoot, manifest); err != nil {
		return PluginManifest{}, err
	}
	return manifest, nil
}

func newPackageManagerDistributionMetadata(distribution pythonenv.PluginDistribution) packageManagerDistributionMetadata {
	distributionName := strings.TrimSpace(distribution.Name)
	normalizedName := normalizePackageManagerDistributionName(distributionName)
	return packageManagerDistributionMetadata{
		distributionName:   distributionName,
		normalizedName:     normalizedName,
		version:            packageManagerVersion(distribution.Version),
		canonicalSourceKey: packageManagerCanonicalSourceKey(normalizedName, distributionName),
	}
}

func (m packageManagerDistributionMetadata) invalidPlugin(pluginRoot string, pluginError PluginErrorInfo) DiscoveredPlugin {
	return invalidPackageManagerDiscoveredPlugin(
		m.distributionName,
		m.normalizedName,
		m.version,
		pluginRoot,
		m.canonicalSourceKey,
		pluginError,
	)
}

func (m packageManagerDistributionMetadata) discoveredPlugin(pluginRoot string, manifest PluginManifest, digest string) DiscoveredPlugin {
	return DiscoveredPlugin{
		PluginID:           manifest.ID,
		Name:               manifest.Name,
		Version:            manifest.Version,
		Scope:              PluginScopeSettaFiles,
		SourcePath:         pluginRoot,
		Manifest:           &manifest,
		CanonicalSourceKey: m.canonicalSourceKey,
		SourceDigestSHA256: stringPtr(digest),
		SourceManager:      PluginSourceManagerPackageManager,
		SourceManagerHint:  packageManagerSourceHint,
	}
}

func invalidPackageManagerDiscoveredPlugin(distributionName string, normalizedName string, version string, pluginRoot string, canonicalSourceKey string, pluginError PluginErrorInfo) DiscoveredPlugin {
	pluginID := normalizedName
	if pluginID == "" {
		pluginID = packageManagerDistributionLabel(distributionName)
	}
	pluginName := strings.TrimSpace(distributionName)
	if pluginName == "" {
		pluginName = pluginID
	}
	return DiscoveredPlugin{
		PluginID:           pluginID,
		Name:               pluginName,
		Version:            version,
		Scope:              PluginScopeSettaFiles,
		SourcePath:         pluginRoot,
		CanonicalSourceKey: canonicalSourceKey,
		SourceManager:      PluginSourceManagerPackageManager,
		SourceManagerHint:  packageManagerSourceHint,
		Errors:             []PluginErrorInfo{pluginError},
		State:              PluginRuntimeStateInvalid,
	}
}

func packageManagerCanonicalSourceKey(normalizedName string, distributionName string) string {
	if normalizedName != "" {
		return "pypi:" + normalizedName
	}
	return "python-env:" + packageManagerDistributionLabel(distributionName)
}

func normalizePackageManagerDistributionName(raw string) string {
	normalized, err := normalizePackageName(raw)
	if err != nil {
		return ""
	}
	return normalized
}

func packageManagerVersion(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "unknown"
	}
	return trimmed
}

func packageManagerDistributionLabel(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "unknown"
	}
	return trimmed
}
