package plugins

import "strings"

type PluginSourceScheme string

const (
	PluginSourceSchemeGitHub PluginSourceScheme = "github"
	PluginSourceSchemePyPI   PluginSourceScheme = "pypi"
)

type ParsedSourceSpec struct {
	Scheme             PluginSourceScheme
	Raw                string
	CanonicalSourceKey string
	Owner              string
	Repo               string
	Ref                string
	Package            string
	Version            string
}

func ParseSourceSpec(sourceSpec string) (ParsedSourceSpec, error) {
	raw := strings.TrimSpace(sourceSpec)
	if raw == "" {
		return ParsedSourceSpec{}, newServiceError(
			ServiceErrorCodeSourceInvalid,
			pluginSourceSpecRequiredMessage,
		)
	}
	if !strings.Contains(raw, ":") {
		return ParsedSourceSpec{}, newServiceError(
			ServiceErrorCodeSourceSchemeUnsupported,
			unsupportedPluginSourceSpecMessageFormat,
			sourceSpec,
		)
	}

	schemeRaw, rest, _ := strings.Cut(raw, ":")
	scheme := strings.ToLower(strings.TrimSpace(schemeRaw))
	switch PluginSourceScheme(scheme) {
	case PluginSourceSchemeGitHub:
		return parseGitHubSourceSpec(raw, rest)
	case PluginSourceSchemePyPI:
		return parsePyPISourceSpec(raw, rest)
	default:
		return ParsedSourceSpec{}, newServiceError(
			ServiceErrorCodeSourceSchemeUnsupported,
			unsupportedPluginSourceSchemeMessageFormat,
			scheme,
		)
	}
}

func SourceSpecIsLocal(sourceSpec string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(sourceSpec)), "local:")
}

func RetargetSourceSpec(sourceSpec string, to string) string {
	trimmedTarget := strings.TrimSpace(to)
	if trimmedTarget == "" {
		return sourceSpec
	}
	if strings.Contains(trimmedTarget, ":") {
		return trimmedTarget
	}
	if strings.HasPrefix(sourceSpec, "github:") {
		githubSpec := strings.TrimPrefix(sourceSpec, "github:")
		hashIndex := strings.Index(githubSpec, "#")
		atIndex := strings.Index(githubSpec, "@")
		splitIndex := -1
		if hashIndex != -1 && atIndex != -1 {
			if hashIndex < atIndex {
				splitIndex = hashIndex
			} else {
				splitIndex = atIndex
			}
		} else if hashIndex != -1 {
			splitIndex = hashIndex
		} else if atIndex != -1 {
			splitIndex = atIndex
		}
		repoSpec := githubSpec
		if splitIndex != -1 {
			repoSpec = githubSpec[:splitIndex]
		}
		return "github:" + repoSpec + "#" + trimmedTarget
	}
	if strings.HasPrefix(sourceSpec, "pypi:") {
		packageSpec := strings.TrimPrefix(sourceSpec, "pypi:")
		packageName, _, err := splitPyPISpec(packageSpec)
		if err != nil {
			return sourceSpec
		}
		if strings.HasPrefix(trimmedTarget, "pypi:") {
			return trimmedTarget
		}
		if strings.Contains(trimmedTarget, "==") {
			return "pypi:" + trimmedTarget
		}
		return "pypi:" + packageName + "==" + trimmedTarget
	}
	return sourceSpec
}

func NormalizeScope(rawScope *PluginScope) (PluginScope, error) {
	if rawScope == nil {
		return PluginScopeWorkspace, nil
	}
	switch *rawScope {
	case PluginScopeWorkspace, PluginScopeSettaFiles, PluginScopeGlobal:
		return *rawScope, nil
	default:
		return "", newServiceError(ServiceErrorCodeScopeInvalid, "Invalid plugin scope: %q", *rawScope)
	}
}

func parseGitHubSourceSpec(raw string, rest string) (ParsedSourceSpec, error) {
	if strings.TrimSpace(rest) == "" {
		return ParsedSourceSpec{}, newServiceError(
			ServiceErrorCodeSourceInvalid,
			gitHubPluginSourceUsageMessage,
		)
	}
	repoSpec := rest
	ref := ""
	hashIndex := strings.Index(rest, "#")
	atIndex := strings.Index(rest, "@")
	if hashIndex != -1 && (atIndex == -1 || hashIndex < atIndex) {
		repoSpec = rest[:hashIndex]
		ref = strings.TrimSpace(rest[hashIndex+1:])
	} else if atIndex != -1 {
		repoSpec = rest[:atIndex]
		ref = strings.TrimSpace(rest[atIndex+1:])
	}
	owner, repo, ok := strings.Cut(repoSpec, "/")
	if !ok || strings.TrimSpace(owner) == "" || strings.TrimSpace(repo) == "" {
		return ParsedSourceSpec{}, newServiceError(
			ServiceErrorCodeSourceInvalid,
			gitHubPluginSourceUsageMessage,
		)
	}
	return ParsedSourceSpec{
		Scheme:             PluginSourceSchemeGitHub,
		Raw:                raw,
		CanonicalSourceKey: "github:" + owner + "/" + repo,
		Owner:              owner,
		Repo:               repo,
		Ref:                ref,
	}, nil
}

func parsePyPISourceSpec(raw string, rest string) (ParsedSourceSpec, error) {
	packageSpec := strings.TrimSpace(rest)
	if packageSpec == "" {
		return ParsedSourceSpec{}, newServiceError(
			ServiceErrorCodeSourceInvalid,
			pyPIPluginSourceUsageMessage,
		)
	}
	packageName, version, err := splitPyPISpec(packageSpec)
	if err != nil {
		return ParsedSourceSpec{}, err
	}
	return ParsedSourceSpec{
		Scheme:             PluginSourceSchemePyPI,
		Raw:                raw,
		CanonicalSourceKey: "pypi:" + packageName,
		Package:            packageName,
		Version:            version,
	}, nil
}

func splitPyPISpec(packageSpec string) (string, string, error) {
	if !strings.Contains(packageSpec, "==") {
		normalizedPackageName, err := normalizePackageName(packageSpec)
		if err != nil {
			return "", "", err
		}
		return normalizedPackageName, "", nil
	}
	packageName, version, _ := strings.Cut(packageSpec, "==")
	normalizedPackageName, err := normalizePackageName(packageName)
	if err != nil {
		return "", "", err
	}
	trimmedVersion := strings.TrimSpace(version)
	if trimmedVersion == "" {
		return "", "", newServiceError(ServiceErrorCodeSourceInvalid, invalidPyPISourceSpecMessageFormat, packageSpec)
	}
	return normalizedPackageName, trimmedVersion, nil
}

func normalizePackageName(packageName string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(packageName))
	if trimmed == "" {
		return "", newServiceError(ServiceErrorCodeSourceInvalid, invalidPackageNameMessageFormat, packageName)
	}
	normalized := make([]byte, 0, len(trimmed))
	for index := 0; index < len(trimmed); index++ {
		char := trimmed[index]
		if isASCIIAlphaNumeric(char) || char == '-' || char == '_' || char == '.' {
			normalized = append(normalized, char)
			continue
		}
		return "", newServiceError(ServiceErrorCodeSourceInvalid, invalidPackageNameMessageFormat, packageName)
	}
	return string(normalized), nil
}
