package typescriptverifier

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"

	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/jsonio"
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
	allowedChangedFiles  []string
	routes               []routeExpectation
	documentation        *documentationExpectation
	jsonFiles            []jsonFileExpectation
	rejectMalformedPort  bool
	requestLog           *requestLogExpectation
}

type documentationExpectation struct {
	checkID        string
	text           string
	sectionHeading string
}

type jsonFileExpectation struct {
	checkID             string
	path                string
	expected            any
	packageNameField    string
	packageVersionField string
}

type requestLogExpectation struct {
	checkID string
	method  string
	path    string
}

type fixturePackageMetadata struct {
	Name    string `json:"name"`
	Version string `json:"version"`
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
	packageMetadata, err := readFixturePackageMetadata(baseline)
	if err != nil {
		return evalverifier.Result{}, err
	}
	definition = definition.withFixturePackageMetadata(packageMetadata)
	if err := validateWorkspaceTree(workspaceRoot); err != nil {
		return workspaceSnapshotFailure(definition.verifierID, err), nil
	}
	workspace, err := evalverifier.ReadWorkspace(workspaceRoot, snapshotOptions)
	if err != nil {
		return workspaceSnapshotFailure(definition.verifierID, err), nil
	}
	changedFiles := evalverifier.ChangedFiles(baseline, workspace)
	checks := initialChecks(definition, changedFiles, workspaceRoot)
	return runFixtureChecks(ctx, definition, workspaceRoot, changedFiles, checks)
}

func runFixtureChecks(
	ctx context.Context,
	definition scenarioDefinition,
	workspaceRoot string,
	changedFiles []string,
	checks []evalverifier.Check,
) (evalverifier.Result, error) {
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

	routeChecks, err := runRouteChecks(
		ctx,
		workspaceRoot,
		definition.routes,
		definition.requestLog,
	)
	if err != nil {
		return evalverifier.Result{}, err
	}
	checks = append(checks, routeChecks...)
	if definition.rejectMalformedPort {
		malformedPortCheck, err := checkMalformedPortRejected(ctx, workspaceRoot)
		if err != nil {
			return evalverifier.Result{}, err
		}
		checks = append(checks, malformedPortCheck)
	}
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
		checkRelatedChanges(
			changedFiles,
			definition.requiredChangedFiles,
			definition.allowedChanges(),
		),
	}
	if definition.documentation != nil {
		checks = append(checks, checkDocumentation(workspaceRoot, *definition.documentation))
	}
	for _, expectation := range definition.jsonFiles {
		checks = append(checks, checkJSONFile(workspaceRoot, expectation))
	}
	return checks
}

func (definition scenarioDefinition) allowedChanges() []string {
	if definition.allowedChangedFiles != nil {
		return definition.allowedChangedFiles
	}
	return definition.requiredChangedFiles
}

func checkRelatedChanges(
	changedFiles []string,
	requiredFiles []string,
	allowedFiles []string,
) evalverifier.Check {
	unrelated, missing := relatedChangeFailures(changedFiles, requiredFiles, allowedFiles)
	if len(unrelated) > 0 || len(missing) > 0 {
		return relatedChangesFailure(unrelated, missing)
	}
	return evalverifier.Check{
		ID:     "related_changes_only",
		Passed: true,
		Detail: "The final workspace changes only task-related files and includes every required file.",
	}
}

func relatedChangeFailures(
	changedFiles []string,
	requiredFiles []string,
	allowedFiles []string,
) ([]string, []string) {
	required := make(map[string]bool, len(requiredFiles))
	for _, path := range requiredFiles {
		required[path] = false
	}
	allowed := make(map[string]struct{}, len(allowedFiles))
	for _, path := range allowedFiles {
		allowed[path] = struct{}{}
	}
	unrelated := make([]string, 0, len(changedFiles))
	for _, path := range changedFiles {
		if _, ok := allowed[path]; !ok {
			unrelated = append(unrelated, path)
			continue
		}
		if _, ok := required[path]; ok {
			required[path] = true
		}
	}
	missing := make([]string, 0, len(required))
	for _, path := range requiredFiles {
		if !required[path] {
			missing = append(missing, path)
		}
	}
	return unrelated, missing
}

func relatedChangesFailure(unrelated []string, missing []string) evalverifier.Check {
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

func validateWorkspaceTree(root string) error {
	return filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("workspace contains symbolic link %s", relativePath(root, path))
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("workspace contains non-regular file %s", relativePath(root, path))
		}
		return nil
	})
}

func relativePath(root string, value string) string {
	relative, err := filepath.Rel(root, value)
	if err != nil {
		return filepath.ToSlash(value)
	}
	return filepath.ToSlash(relative)
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
	searchable := string(content)
	location := "README.md"
	if expectation.sectionHeading != "" {
		section, exists := markdownSection(searchable, expectation.sectionHeading)
		if !exists {
			return evalverifier.Check{
				ID:     expectation.checkID,
				Passed: false,
				Detail: fmt.Sprintf("README.md does not contain %s.", expectation.sectionHeading),
			}
		}
		searchable = section
		location = "README.md " + expectation.sectionHeading + " section"
	}
	if !strings.Contains(searchable, expectation.text) {
		return evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: fmt.Sprintf("%s does not document %s.", location, expectation.text),
		}
	}
	return evalverifier.Check{
		ID:     expectation.checkID,
		Passed: true,
		Detail: fmt.Sprintf("%s documents %s.", location, expectation.text),
	}
}

func markdownSection(document string, heading string) (string, bool) {
	startMarker := heading + "\n"
	start := strings.Index(document, startMarker)
	if start < 0 || (start > 0 && document[start-1] != '\n') {
		return "", false
	}
	section := document[start+len(startMarker):]
	if end := strings.Index(section, "\n## "); end >= 0 {
		section = section[:end]
	}
	return section, true
}

func checkJSONFile(
	workspaceRoot string,
	expectation jsonFileExpectation,
) evalverifier.Check {
	content, err := os.ReadFile(filepath.Join(workspaceRoot, filepath.FromSlash(expectation.path)))
	if err != nil {
		return evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: evalverifier.BoundedDetail(fmt.Sprintf("Read %s: %v", expectation.path, err)),
		}
	}
	var actual any
	if err := jsonio.DecodeSingle(strings.NewReader(string(content)), &actual); err != nil {
		return evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: evalverifier.BoundedDetail(fmt.Sprintf("Decode %s: %v", expectation.path, err)),
		}
	}
	if !reflect.DeepEqual(actual, expectation.expected) {
		return evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: evalverifier.BoundedDetail(fmt.Sprintf(
				"%s contains %#v, want %#v.",
				expectation.path,
				actual,
				expectation.expected,
			)),
		}
	}
	return evalverifier.Check{
		ID:     expectation.checkID,
		Passed: true,
		Detail: fmt.Sprintf("%s contains the exact expected JSON value.", expectation.path),
	}
}
