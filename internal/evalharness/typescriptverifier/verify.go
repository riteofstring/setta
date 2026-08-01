package typescriptverifier

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"setta/internal/evalharness"
	evalverifier "setta/internal/evalharness/verifier"
)

var snapshotOptions = evalverifier.SnapshotOptions{
	IgnoredDirectoryNames: []string{".git", "dist", "node_modules"},
}

type routeExpectation struct {
	checkID        string
	path           string
	status         int
	body           map[string]any
	attempts       int
	fixtureVersion bool
}

type scenarioDefinition struct {
	verifierID           string
	requiredChangedFiles []string
	routes               []routeExpectation
	documentation        *documentationExpectation
}

type documentationExpectation struct {
	checkID string
	text    string
}

func Verify(
	ctx context.Context,
	verifierID string,
	baselineRoot string,
	workspaceRoot string,
) (evalverifier.Result, error) {
	if ctx == nil {
		return evalverifier.Result{}, errors.New("typescript-service verifier context is required")
	}
	definition, err := definitionFor(verifierID)
	if err != nil {
		return evalverifier.Result{}, err
	}
	baselineRoot, workspaceRoot, err = validateRoots(baselineRoot, workspaceRoot)
	if err != nil {
		return evalverifier.Result{}, err
	}
	if err := requireVerifierCommands("node", "pnpm"); err != nil {
		return evalverifier.Result{}, err
	}
	baseline, err := evalverifier.ReadWorkspace(baselineRoot, snapshotOptions)
	if err != nil {
		return evalverifier.Result{}, fmt.Errorf("read trusted verifier baseline: %w", err)
	}
	version, err := readFixtureVersion(baseline)
	if err != nil {
		return evalverifier.Result{}, err
	}
	definition = definition.withFixtureVersion(version)
	workspace, err := evalverifier.ReadWorkspace(workspaceRoot, snapshotOptions)
	if err != nil {
		return workspaceSnapshotFailure(definition.verifierID, err), nil
	}
	changedFiles := evalverifier.ChangedFiles(baseline, workspace)
	checks := initialChecks(definition, changedFiles, workspaceRoot)

	buildCheck, err := runCommandCheck(
		ctx,
		workspaceRoot,
		"build",
		"pnpm run build",
		"pnpm",
		"run",
		"build",
	)
	if err != nil {
		return evalverifier.Result{}, err
	}
	checks = append(checks, buildCheck)
	if !buildCheck.Passed {
		checks = append(checks, skippedRouteChecks(definition.routes)...)
		checks = append(checks, skippedTestCheck())
		return evalverifier.NewResult(definition.verifierID, checks, changedFiles), nil
	}

	routeChecks, err := runRouteChecks(ctx, workspaceRoot, definition.routes)
	if err != nil {
		return evalverifier.Result{}, err
	}
	checks = append(checks, routeChecks...)
	testCheck, err := runCommandCheck(
		ctx,
		workspaceRoot,
		"tests",
		"pnpm test",
		"pnpm",
		"test",
	)
	if err != nil {
		return evalverifier.Result{}, err
	}
	checks = append(checks, testCheck)
	return evalverifier.NewResult(definition.verifierID, checks, changedFiles), nil
}

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

func (definition scenarioDefinition) withFixtureVersion(version string) scenarioDefinition {
	for index := range definition.routes {
		if !definition.routes[index].fixtureVersion {
			continue
		}
		body := make(map[string]any, len(definition.routes[index].body)+1)
		for name, value := range definition.routes[index].body {
			body[name] = value
		}
		body["version"] = version
		definition.routes[index].body = body
	}
	return definition
}

func readFixtureVersion(baseline evalverifier.WorkspaceSnapshot) (string, error) {
	packageFile, exists := baseline["package.json"]
	if !exists {
		return "", errors.New("trusted verifier baseline omitted package.json")
	}
	var metadata struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(packageFile.Content, &metadata); err != nil {
		return "", fmt.Errorf("decode trusted verifier package.json: %w", err)
	}
	if strings.TrimSpace(metadata.Version) == "" || strings.TrimSpace(metadata.Version) != metadata.Version {
		return "", errors.New("trusted verifier package.json has no normalized version")
	}
	return metadata.Version, nil
}

func validateRoots(baselineRoot string, workspaceRoot string) (string, string, error) {
	baselineRoot, err := filepath.Abs(baselineRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve baseline root: %w", err)
	}
	workspaceRoot, err = filepath.Abs(workspaceRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve workspace root: %w", err)
	}
	baselineRoot, err = filepath.EvalSymlinks(baselineRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve baseline root links: %w", err)
	}
	workspaceRoot, err = filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		return "", "", fmt.Errorf("resolve workspace root links: %w", err)
	}
	if baselineRoot == workspaceRoot {
		return "", "", errors.New("baseline and workspace roots must be different")
	}
	return baselineRoot, workspaceRoot, nil
}

func requireVerifierCommands(names ...string) error {
	for _, name := range names {
		if _, err := exec.LookPath(name); err != nil {
			return fmt.Errorf("verifier command %s is unavailable: %w", name, err)
		}
	}
	return nil
}

func workspaceSnapshotFailure(verifierID string, err error) evalverifier.Result {
	return evalverifier.NewResult(
		verifierID,
		[]evalverifier.Check{{
			ID:     "workspace_snapshot",
			Passed: false,
			Detail: evalverifier.BoundedDetail(err.Error()),
		}},
		[]string{},
	)
}

func initialChecks(
	definition scenarioDefinition,
	changedFiles []string,
	workspaceRoot string,
) []evalverifier.Check {
	checks := []evalverifier.Check{
		checkRelatedChanges(changedFiles, definition.requiredChangedFiles),
	}
	if definition.documentation != nil {
		checks = append(checks, checkDocumentation(workspaceRoot, *definition.documentation))
	}
	return checks
}

func checkRelatedChanges(changedFiles []string, requiredFiles []string) evalverifier.Check {
	required := make(map[string]bool, len(requiredFiles))
	for _, path := range requiredFiles {
		required[path] = false
	}
	unrelated := make([]string, 0, len(changedFiles))
	for _, path := range changedFiles {
		if _, ok := required[path]; ok {
			required[path] = true
			continue
		}
		unrelated = append(unrelated, path)
	}
	missing := make([]string, 0, len(required))
	for _, path := range requiredFiles {
		if !required[path] {
			missing = append(missing, path)
		}
	}
	if len(unrelated) > 0 || len(missing) > 0 {
		details := make([]string, 0, 2)
		if len(unrelated) > 0 {
			details = append(details, "unrelated workspace changes: "+strings.Join(unrelated, ", "))
		}
		if len(missing) > 0 {
			details = append(details, "required task files unchanged: "+strings.Join(missing, ", "))
		}
		return evalverifier.Check{
			ID:     "related_changes_only",
			Passed: false,
			Detail: evalverifier.BoundedDetail(strings.Join(details, "; ")),
		}
	}
	return evalverifier.Check{
		ID:     "related_changes_only",
		Passed: true,
		Detail: "The final workspace changes exactly the source files required by the scenario.",
	}
}

func checkDocumentation(
	workspaceRoot string,
	expectation documentationExpectation,
) evalverifier.Check {
	content, err := os.ReadFile(filepath.Join(workspaceRoot, "README.md"))
	if err != nil {
		return evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: evalverifier.BoundedDetail(fmt.Sprintf("Read README.md: %v", err)),
		}
	}
	if !strings.Contains(string(content), expectation.text) {
		return evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: fmt.Sprintf("README.md does not document %s.", expectation.text),
		}
	}
	return evalverifier.Check{
		ID:     expectation.checkID,
		Passed: true,
		Detail: fmt.Sprintf("README.md documents %s.", expectation.text),
	}
}
