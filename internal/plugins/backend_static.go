package plugins

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

func (s *Service) ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error) {
	if s == nil {
		return "", false, ErrWorkspaceRootRequired
	}

	trimmedRequestPath := strings.TrimSpace(requestPath)
	if trimmedRequestPath == "" || !strings.HasPrefix(trimmedRequestPath, "/") {
		return "", true, newServiceError(
			ServiceErrorCodeAssetInvalidPath,
			"Invalid plugin backend static asset path: %s",
			requestPath,
		)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return "", false, err
	}

	match, ok, err := findRegisteredStaticAssetMatch(snapshot.Plugins, trimmedRequestPath)
	if err != nil {
		return "", true, err
	}
	if !ok {
		return "", false, nil
	}

	resolvedPath, err := resolveRegisteredStaticAssetPath(match, trimmedRequestPath)
	if err != nil {
		return "", true, err
	}
	return resolvedPath, true, nil
}

type registeredStaticAssetMatch struct {
	Entry        DiscoveredPlugin
	Registration PluginRegisteredStaticDir
	RelativePath string
}

type registeredStaticAssetSearch struct {
	match        registeredStaticAssetMatch
	prefixLength int
	found        bool
}

func findRegisteredStaticAssetMatch(entries []DiscoveredPlugin, requestPath string) (registeredStaticAssetMatch, bool, error) {
	search := registeredStaticAssetSearch{prefixLength: -1}
	for _, entry := range entries {
		if !canServeRegisteredStaticAssets(entry) {
			continue
		}
		nextSearch, err := searchRegisteredStaticAssetEntry(search, entry, requestPath)
		if err != nil {
			return registeredStaticAssetMatch{}, false, err
		}
		search = nextSearch
	}
	return search.match, search.found, nil
}

func canServeRegisteredStaticAssets(entry DiscoveredPlugin) bool {
	if entry.Manifest == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsString(entry.EffectiveCapabilities, "registerStaticDir")
}

func searchRegisteredStaticAssetEntry(
	search registeredStaticAssetSearch,
	entry DiscoveredPlugin,
	requestPath string,
) (registeredStaticAssetSearch, error) {
	for _, registration := range entry.RegisteredStaticDirs {
		relativePath, ok := matchRegisteredStaticDirPath(registration.RoutePrefix, requestPath)
		if !ok {
			continue
		}
		nextSearch, matched, err := selectRegisteredStaticAssetMatch(search, entry, registration, relativePath)
		if err != nil {
			return registeredStaticAssetSearch{}, err
		}
		if matched {
			search = nextSearch
		}
	}
	return search, nil
}

func selectRegisteredStaticAssetMatch(
	search registeredStaticAssetSearch,
	entry DiscoveredPlugin,
	registration PluginRegisteredStaticDir,
	relativePath string,
) (registeredStaticAssetSearch, bool, error) {
	prefixLength := len(registration.RoutePrefix)
	if !search.found || prefixLength > search.prefixLength {
		return registeredStaticAssetSearch{
			match: registeredStaticAssetMatch{
				Entry:        entry,
				Registration: registration,
				RelativePath: relativePath,
			},
			prefixLength: prefixLength,
			found:        true,
		}, true, nil
	}
	if prefixLength == search.prefixLength && registration.RoutePrefix == search.match.Registration.RoutePrefix {
		return registeredStaticAssetSearch{}, false, newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Conflicting plugin static dir registrations for %s: %s and %s",
			registration.RoutePrefix,
			search.match.Entry.PluginID,
			entry.PluginID,
		)
	}
	return search, false, nil
}

func matchRegisteredStaticDirPath(routePrefix string, requestPath string) (string, bool) {
	if routePrefix == "/" {
		return strings.TrimPrefix(requestPath, "/"), true
	}
	if requestPath == routePrefix {
		return "", true
	}
	prefixWithSlash := routePrefix + "/"
	if !strings.HasPrefix(requestPath, prefixWithSlash) {
		return "", false
	}
	return strings.TrimPrefix(requestPath, prefixWithSlash), true
}

func resolveRegisteredStaticAssetPath(match registeredStaticAssetMatch, requestPath string) (string, error) {
	if strings.TrimSpace(match.RelativePath) == "" {
		return "", newServiceError(
			ServiceErrorCodeAssetNotFound,
			"Plugin backend static asset not found: %s",
			requestPath,
		)
	}

	staticRoot, err := resolveManifestDirectory(match.Entry.SourcePath, match.Registration.Dir, "plugin backend static dir")
	if err != nil {
		return "", newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Invalid plugin backend static dir for plugin %s: %s",
			match.Entry.PluginID,
			err.Error(),
		)
	}

	resolvedPath, err := statefs.ResolveWithinRoot(staticRoot, filepath.FromSlash(match.RelativePath), "plugin backend static asset path")
	if err != nil {
		return "", newServiceError(
			ServiceErrorCodeAssetInvalidPath,
			"Invalid plugin backend static asset path: %s",
			requestPath,
		)
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", newServiceError(
				ServiceErrorCodeAssetNotFound,
				"Plugin backend static asset not found: %s",
				requestPath,
			)
		}
		return "", fmt.Errorf("stat plugin backend static asset %s: %w", resolvedPath, err)
	}
	if !info.Mode().IsRegular() {
		return "", newServiceError(
			ServiceErrorCodeAssetNotFound,
			"Plugin backend static asset not found: %s",
			requestPath,
		)
	}
	return resolvedPath, nil
}
