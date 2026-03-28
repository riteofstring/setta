package plugins

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/statefs"
)

const (
	packageManagerSourceHint       = "Managed by Python package manager in active environment. Use uv/pip/Poetry to install, update, or remove."
	packageManagerDiscoveryTimeout = 30 * time.Second
	ambiguousPluginRootErrorCode   = "PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT"
	invalidPluginManifestErrorCode = "PLUGIN_MANIFEST_INVALID"
)

func (s *DiscoveryService) discoverPackageManagerPlugins() ([]DiscoveredPlugin, error) {
	if s == nil || s.packageManagerRuntime == nil {
		return nil, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), packageManagerDiscoveryTimeout)
	defer cancel()

	distributions, err := s.packageManagerRuntime.PluginDistributions(ctx, s.packageManagerSearchPaths)
	if err != nil {
		return nil, err
	}

	entries := make([]DiscoveredPlugin, 0, len(distributions))
	seenRoots := map[string]struct{}{}
	for _, distribution := range distributions {
		manifestPaths := make([]string, 0, len(distribution.ManifestPaths))
		for _, manifestPath := range distribution.ManifestPaths {
			normalizedManifestPath, err := statefs.NormalizePath(manifestPath, "")
			if err != nil {
				return nil, err
			}
			manifestPaths = append(manifestPaths, normalizedManifestPath)
		}
		if len(manifestPaths) == 0 {
			continue
		}

		distributionName := strings.TrimSpace(distribution.Name)
		normalizedName := normalizePackageManagerDistributionName(distributionName)
		canonicalSourceKey := packageManagerCanonicalSourceKey(normalizedName, distributionName)

		if len(manifestPaths) > 1 {
			entries = append(entries, invalidPackageManagerDiscoveredPlugin(
				distributionName,
				normalizedName,
				packageManagerVersion(distribution.Version),
				filepath.Dir(manifestPaths[0]),
				canonicalSourceKey,
				PluginErrorInfo{
					Code: ambiguousPluginRootErrorCode,
					Message: fmt.Sprintf(
						"Environment distribution contained multiple setta.plugin.json files: %s",
						packageManagerDistributionLabel(distributionName),
					),
				},
			))
			continue
		}

		pluginRoot := filepath.Dir(manifestPaths[0])
		if _, ok := seenRoots[pluginRoot]; ok {
			continue
		}
		seenRoots[pluginRoot] = struct{}{}

		manifest, err := loadPluginManifestFile(manifestPaths[0])
		if err != nil {
			entries = append(entries, invalidPackageManagerDiscoveredPlugin(
				distributionName,
				normalizedName,
				packageManagerVersion(distribution.Version),
				pluginRoot,
				canonicalSourceKey,
				PluginErrorInfo{
					Code:    invalidPluginManifestErrorCode,
					Message: err.Error(),
				},
			))
			continue
		}
		if err := ValidatePluginManifestPaths(pluginRoot, manifest); err != nil {
			entries = append(entries, invalidPackageManagerDiscoveredPlugin(
				distributionName,
				normalizedName,
				packageManagerVersion(distribution.Version),
				pluginRoot,
				canonicalSourceKey,
				PluginErrorInfo{
					Code:    invalidPluginManifestErrorCode,
					Message: err.Error(),
				},
			))
			continue
		}

		digest, err := computeDirectoryDigest(pluginRoot)
		if err != nil {
			return nil, err
		}
		entries = append(entries, DiscoveredPlugin{
			PluginID:           manifest.ID,
			Name:               manifest.Name,
			Version:            manifest.Version,
			Scope:              PluginScopeSettaFiles,
			SourcePath:         pluginRoot,
			Manifest:           &manifest,
			CanonicalSourceKey: canonicalSourceKey,
			SourceDigestSHA256: stringPtr(digest),
			SourceManager:      PluginSourceManagerPackageManager,
			SourceManagerHint:  packageManagerSourceHint,
		})
	}

	return entries, nil
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
