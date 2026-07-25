package runtime

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"setta/internal/httpapi"
)

const runtimeInfrastructureProviderEnv = "SETTA_RUNTIME_INFRA_PROVIDER"

var runtimeInfrastructureProviders = map[string]httpapi.RuntimeInfrastructureProvider{
	"aws": {
		ID:          "aws",
		DisplayName: "AWS",
		IconURL:     "https://aws.amazon.com/favicon.ico",
	},
	"azure": {
		ID:          "azure",
		DisplayName: "Azure",
		IconURL:     "https://azure.microsoft.com/favicon.ico",
	},
	"codesandbox": {
		ID:          "codesandbox",
		DisplayName: "CodeSandbox",
		IconURL:     "https://codesandbox.io/favicon.ico",
	},
	"google-cloud": {
		ID:          "google-cloud",
		DisplayName: "Google Cloud",
		IconURL:     "https://cloud.google.com/favicon.ico",
	},
	"hetzner": {
		ID:          "hetzner",
		DisplayName: "Hetzner",
		IconURL:     "https://www.hetzner.com/favicon.ico",
	},
	"paperspace": {
		ID:          "paperspace",
		DisplayName: "Paperspace",
		IconURL:     "https://www.paperspace.com/favicon.ico",
	},
	"unknown": httpapi.UnknownRuntimeInfrastructureProvider(),
}

type infrastructureProbe struct {
	getenv   func(string) (string, bool)
	readText func(string) (string, error)
}

func defaultRuntimeInfrastructureProvider() (httpapi.RuntimeInfrastructureProvider, error) {
	return detectRuntimeInfrastructureProvider(infrastructureProbe{
		getenv:   os.LookupEnv,
		readText: readInfrastructureProbeFile,
	})
}

func detectRuntimeInfrastructureProvider(probe infrastructureProbe) (httpapi.RuntimeInfrastructureProvider, error) {
	probe = normalizeInfrastructureProbe(probe)
	provider, ok, err := explicitRuntimeInfrastructureProvider(probe)
	if err != nil {
		return httpapi.RuntimeInfrastructureProvider{}, err
	}
	if ok {
		return provider, nil
	}
	if provider, ok := runtimeInfrastructureProviderFromEnv(probe); ok {
		return provider, nil
	}
	if provider, ok := runtimeInfrastructureProviderFromDMI(readInfrastructureDMI(probe)); ok {
		return provider, nil
	}
	return mustRuntimeInfrastructureProvider("unknown"), nil
}

func normalizeInfrastructureProbe(probe infrastructureProbe) infrastructureProbe {
	if probe.getenv == nil {
		probe.getenv = os.LookupEnv
	}
	if probe.readText == nil {
		probe.readText = readInfrastructureProbeFile
	}
	return probe
}

func explicitRuntimeInfrastructureProvider(
	probe infrastructureProbe,
) (httpapi.RuntimeInfrastructureProvider, bool, error) {
	if rawProvider, ok := probe.getenv(runtimeInfrastructureProviderEnv); ok {
		provider, err := runtimeInfrastructureProviderByID(rawProvider)
		if err != nil {
			return httpapi.RuntimeInfrastructureProvider{}, true, err
		}
		return provider, true, nil
	}
	return httpapi.RuntimeInfrastructureProvider{}, false, nil
}

func runtimeInfrastructureProviderFromEnv(probe infrastructureProbe) (httpapi.RuntimeInfrastructureProvider, bool) {
	if hasAnyInfrastructureEnv(probe, "CODESANDBOX_HOST", "CODESANDBOX_SSE", "CSB") {
		return mustRuntimeInfrastructureProvider("codesandbox"), true
	}
	if hasAnyInfrastructureEnv(probe, "PAPERSPACE_CLUSTER_ID", "PAPERSPACE_FQDN", "PAPERSPACE_NOTEBOOK_ID") {
		return mustRuntimeInfrastructureProvider("paperspace"), true
	}
	if hasAnyInfrastructureEnv(probe, "WEBSITE_INSTANCE_ID", "WEBSITE_SITE_NAME") {
		return mustRuntimeInfrastructureProvider("azure"), true
	}
	return httpapi.RuntimeInfrastructureProvider{}, false
}

func runtimeInfrastructureProviderFromDMI(values []string) (httpapi.RuntimeInfrastructureProvider, bool) {
	switch {
	case hasExactInfrastructureSignal(values, "Amazon EC2"):
		return mustRuntimeInfrastructureProvider("aws"), true
	case hasExactInfrastructureSignal(values, "Google Compute Engine"):
		return mustRuntimeInfrastructureProvider("google-cloud"), true
	case hasExactInfrastructureSignal(values, "7783-7084-3265-9085-8269-3286-77") &&
		hasExactInfrastructureSignal(values, "Microsoft Corporation"):
		return mustRuntimeInfrastructureProvider("azure"), true
	case hasSubstringInfrastructureSignal(values, "Hetzner"):
		return mustRuntimeInfrastructureProvider("hetzner"), true
	default:
		return httpapi.RuntimeInfrastructureProvider{}, false
	}
}

func runtimeInfrastructureProviderByID(rawID string) (httpapi.RuntimeInfrastructureProvider, error) {
	providerID := normalizeRuntimeInfrastructureProviderID(rawID)
	provider, ok := runtimeInfrastructureProviders[providerID]
	if !ok {
		return httpapi.RuntimeInfrastructureProvider{}, fmt.Errorf(
			"%s must be one of: %s",
			runtimeInfrastructureProviderEnv,
			strings.Join(sortedRuntimeInfrastructureProviderIDs(), ", "),
		)
	}
	return provider, nil
}

func mustRuntimeInfrastructureProvider(providerID string) httpapi.RuntimeInfrastructureProvider {
	provider, ok := runtimeInfrastructureProviders[providerID]
	if !ok {
		panic("unknown runtime infrastructure provider: " + providerID)
	}
	return provider
}

func normalizeRuntimeInfrastructureProviderID(rawID string) string {
	normalized := strings.ToLower(strings.TrimSpace(rawID))
	normalized = strings.NewReplacer("_", "-", " ", "-", ".", "-").Replace(normalized)
	for strings.Contains(normalized, "--") {
		normalized = strings.ReplaceAll(normalized, "--", "-")
	}
	switch normalized {
	case "amazon", "amazon-ec2", "amazon-web-services":
		return "aws"
	case "gcp", "google", "google-cloud-compute", "google-compute-engine":
		return "google-cloud"
	case "microsoft-azure":
		return "azure"
	default:
		return normalized
	}
}

func sortedRuntimeInfrastructureProviderIDs() []string {
	ids := make([]string, 0, len(runtimeInfrastructureProviders))
	for providerID := range runtimeInfrastructureProviders {
		ids = append(ids, providerID)
	}
	sort.Strings(ids)
	return ids
}

func hasAnyInfrastructureEnv(probe infrastructureProbe, keys ...string) bool {
	for _, key := range keys {
		value, ok := probe.getenv(key)
		if ok && strings.TrimSpace(value) != "" {
			return true
		}
	}
	return false
}

func readInfrastructureDMI(probe infrastructureProbe) []string {
	paths := []string{
		"/sys/class/dmi/id/sys_vendor",
		"/sys/class/dmi/id/product_name",
		"/sys/class/dmi/id/product_version",
		"/sys/class/dmi/id/chassis_asset_tag",
		"/sys/class/dmi/id/board_vendor",
		"/sys/class/dmi/id/bios_vendor",
	}
	values := make([]string, 0, len(paths))
	for _, path := range paths {
		rawValue, err := probe.readText(path)
		if err != nil {
			continue
		}
		value := strings.TrimSpace(rawValue)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}

func hasExactInfrastructureSignal(values []string, expected string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), expected) {
			return true
		}
	}
	return false
}

func hasSubstringInfrastructureSignal(values []string, expected string) bool {
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), strings.ToLower(expected)) {
			return true
		}
	}
	return false
}

func readInfrastructureProbeFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
