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

func findRegisteredStaticAssetMatch(entries []DiscoveredPlugin, requestPath string) (registeredStaticAssetMatch, bool, error) {
	bestMatch := registeredStaticAssetMatch{}
	bestMatchLength := -1
	found := false
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		if !containsString(entry.EffectiveCapabilities, "registerStaticDir") {
			continue
		}

		for _, registration := range entry.RegisteredStaticDirs {
			relativePath, ok := matchRegisteredStaticDirPath(registration.RoutePrefix, requestPath)
			if !ok {
				continue
			}

			prefixLength := len(registration.RoutePrefix)
			if !found || prefixLength > bestMatchLength {
				bestMatch = registeredStaticAssetMatch{
					Entry:        entry,
					Registration: registration,
					RelativePath: relativePath,
				}
				bestMatchLength = prefixLength
				found = true
				continue
			}
			if prefixLength == bestMatchLength && registration.RoutePrefix == bestMatch.Registration.RoutePrefix {
				return registeredStaticAssetMatch{}, false, newServiceError(
					ServiceErrorCodeBackendRuntimeInvalid,
					"Conflicting plugin static dir registrations for %s: %s and %s",
					registration.RoutePrefix,
					bestMatch.Entry.PluginID,
					entry.PluginID,
				)
			}
		}
	}
	return bestMatch, found, nil
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
