package typescriptverifier

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/evalharness"
	evalverifier "setta/internal/evalharness/verifier"
)

func definitionFor(verifierID string) (scenarioDefinition, error) {
	rootRoute := routeExpectation{
		checkID: "root_route",
		path:    "/",
		status:  200,
		body:    map[string]any{"service": "setta-eval-fixture"},
	}
	definitions := map[string]scenarioDefinition{
		evalharness.ScenarioVerifierStraightforward: {
			verifierID: evalharness.ScenarioVerifierStraightforward,
			requiredChangedFiles: []string{
				"README.md",
				"src/server.ts",
				"test/server.test.ts",
			},
			routes: []routeExpectation{
				rootRoute,
				{
					checkID: "health_route",
					path:    "/health",
					status:  200,
					body:    map[string]any{"ok": true},
				},
			},
			documentation: &documentationExpectation{
				checkID: "health_documented",
				text:    "GET /health",
			},
		},
		evalharness.ScenarioVerifierApparentAmbiguity: readinessDefinition(
			evalharness.ScenarioVerifierApparentAmbiguity,
			rootRoute,
		),
		evalharness.ScenarioVerifierDocumentationOnly: {
			verifierID:           evalharness.ScenarioVerifierDocumentationOnly,
			requiredChangedFiles: []string{"README.md"},
			routes:               []routeExpectation{rootRoute},
			documentation: &documentationExpectation{
				checkID:        "format_command_documented",
				text:           "pnpm run format",
				sectionHeading: "## Development",
			},
		},
		evalharness.ScenarioVerifierExternalFile: {
			verifierID:           evalharness.ScenarioVerifierExternalFile,
			requiredChangedFiles: []string{"release-manifest.json"},
			routes:               []routeExpectation{rootRoute},
			jsonFiles: []jsonFileExpectation{{
				checkID:             "release_manifest",
				path:                "release-manifest.json",
				expected:            map[string]any{},
				packageNameField:    "package",
				packageVersionField: "release",
			}},
		},
		evalharness.ScenarioVerifierGenuineAmbiguity: readinessDefinition(
			evalharness.ScenarioVerifierGenuineAmbiguity,
			rootRoute,
		),
		evalharness.ScenarioVerifierMidRunSteering: {
			verifierID: evalharness.ScenarioVerifierMidRunSteering,
			requiredChangedFiles: []string{
				"src/server.ts",
				"test/server.test.ts",
			},
			routes: []routeExpectation{
				rootRoute,
				{
					checkID:        "status_route",
					path:           "/status",
					status:         200,
					body:           map[string]any{"ok": true},
					fixtureVersion: true,
				},
				absentRoute("health_absent", "/health"),
			},
		},
		evalharness.ScenarioVerifierQueueThenCancel: {
			verifierID: evalharness.ScenarioVerifierQueueThenCancel,
			requiredChangedFiles: []string{
				"src/server.ts",
			},
			allowedChangedFiles: []string{
				"src/server.ts",
				"test/server.test.ts",
			},
			routes: []routeExpectation{
				rootRoute,
				{
					checkID:        "version_route",
					path:           "/version",
					status:         200,
					body:           map[string]any{},
					attempts:       2,
					fixtureVersion: true,
				},
			},
		},
		evalharness.ScenarioVerifierRamblingPort: {
			verifierID: evalharness.ScenarioVerifierRamblingPort,
			requiredChangedFiles: []string{
				"src/server.ts",
				"test/server.test.ts",
			},
			routes:              []routeExpectation{rootRoute},
			rejectMalformedPort: true,
		},
		evalharness.ScenarioVerifierRequestLogging: {
			verifierID: evalharness.ScenarioVerifierRequestLogging,
			requiredChangedFiles: []string{
				"src/server.ts",
				"test/server.test.ts",
			},
			routes: []routeExpectation{rootRoute},
			requestLog: &requestLogExpectation{
				checkID: "request_log",
				method:  "GET",
				path:    "/",
			},
		},
		evalharness.ScenarioVerifierStableReleaseData: {
			verifierID:           evalharness.ScenarioVerifierStableReleaseData,
			requiredChangedFiles: []string{"data/stable-releases.json"},
			routes:               []routeExpectation{rootRoute},
			jsonFiles: []jsonFileExpectation{{
				checkID: "stable_releases",
				path:    "data/stable-releases.json",
				expected: []any{
					map[string]any{"service": "api", "version": "1.4.0"},
					map[string]any{"service": "worker", "version": "1.9.2"},
				},
			}},
		},
	}
	definition, ok := definitions[verifierID]
	if !ok {
		return scenarioDefinition{}, fmt.Errorf("typescript-service verifier %q is not supported", verifierID)
	}
	return definition, nil
}

func readinessDefinition(verifierID string, rootRoute routeExpectation) scenarioDefinition {
	return scenarioDefinition{
		verifierID: verifierID,
		requiredChangedFiles: []string{
			"src/server.ts",
			"test/server.test.ts",
		},
		routes: []routeExpectation{
			rootRoute,
			{
				checkID:        "ready_route",
				path:           "/ready",
				status:         200,
				body:           map[string]any{"ready": true},
				fixtureVersion: true,
			},
			absentRoute("live_absent", "/live"),
		},
	}
}

func absentRoute(checkID string, path string) routeExpectation {
	return routeExpectation{
		checkID: checkID,
		path:    path,
		status:  404,
		body:    map[string]any{"error": "not_found"},
	}
}

func (definition scenarioDefinition) withFixturePackageMetadata(
	metadata fixturePackageMetadata,
) scenarioDefinition {
	for index := range definition.routes {
		if !definition.routes[index].fixtureVersion {
			continue
		}
		body := make(map[string]any, len(definition.routes[index].body)+1)
		for name, value := range definition.routes[index].body {
			body[name] = value
		}
		body["version"] = metadata.Version
		definition.routes[index].body = body
	}
	for index := range definition.jsonFiles {
		expectation := &definition.jsonFiles[index]
		body, ok := expectation.expected.(map[string]any)
		if !ok {
			continue
		}
		cloned := make(map[string]any, len(body)+2)
		for name, value := range body {
			cloned[name] = value
		}
		if expectation.packageNameField != "" {
			cloned[expectation.packageNameField] = metadata.Name
		}
		if expectation.packageVersionField != "" {
			cloned[expectation.packageVersionField] = metadata.Version
		}
		expectation.expected = cloned
	}
	return definition
}

func readFixturePackageMetadata(
	baseline evalverifier.WorkspaceSnapshot,
) (fixturePackageMetadata, error) {
	packageFile, exists := baseline["package.json"]
	if !exists {
		return fixturePackageMetadata{}, errors.New("trusted verifier baseline omitted package.json")
	}
	var metadata fixturePackageMetadata
	if err := json.Unmarshal(packageFile.Content, &metadata); err != nil {
		return fixturePackageMetadata{}, fmt.Errorf("decode trusted verifier package.json: %w", err)
	}
	if strings.TrimSpace(metadata.Name) == "" || strings.TrimSpace(metadata.Name) != metadata.Name {
		return fixturePackageMetadata{}, errors.New("trusted verifier package.json has no normalized name")
	}
	if strings.TrimSpace(metadata.Version) == "" || strings.TrimSpace(metadata.Version) != metadata.Version {
		return fixturePackageMetadata{}, errors.New("trusted verifier package.json has no normalized version")
	}
	return metadata, nil
}
