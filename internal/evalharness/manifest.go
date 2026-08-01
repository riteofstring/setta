package evalharness

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"path/filepath"
	"sort"
	"time"

	evalverifier "setta/internal/evalharness/verifier"
)

const (
	ManifestSchemaVersion = 1
	phase1BackendVersion  = "dev"
)

type ManifestScenario struct {
	ScenarioID                string                       `json:"scenarioId"`
	ScenarioSHA256            string                       `json:"scenarioSha256"`
	Fixture                   string                       `json:"fixture"`
	FixtureSHA256             string                       `json:"fixtureSha256"`
	CommunicationRubricSHA256 string                       `json:"communicationRubricSha256"`
	Roles                     []EvaluatedRoleConfiguration `json:"roles"`
}

type ManifestSandbox struct {
	Platform         string `json:"platform"`
	ToolchainImage   string `json:"toolchainImage"`
	ToolchainImageID string `json:"toolchainImageId"`
	AgentImageID     string `json:"agentImageId"`
	BackendImageID   string `json:"backendImageId"`
	VerifierImageID  string `json:"verifierImageId"`
}

type ManifestRuntime struct {
	BackendVersion string `json:"backendVersion"`
	CodexVersion   string `json:"codexVersion"`
	NodeVersion    string `json:"nodeVersion"`
	PNPMVersion    string `json:"pnpmVersion"`
}

type EvaluationManifest struct {
	SchemaVersion int                `json:"schemaVersion"`
	SettaCommit   string             `json:"settaCommit"`
	StartedAt     time.Time          `json:"startedAt"`
	FinishedAt    time.Time          `json:"finishedAt"`
	Scenarios     []ManifestScenario `json:"scenarios"`
	Sandbox       *ManifestSandbox   `json:"sandbox"`
	Judge         JudgeConfiguration `json:"judge"`
	Runtime       ManifestRuntime    `json:"runtime"`
}

func buildEvaluationManifest(
	repoRoot string,
	settaCommit string,
	phase0 Phase0CodexEvidence,
	scenario Scenario,
	startedAt time.Time,
	finishedAt time.Time,
	roles []EvaluatedRoleConfiguration,
	sandbox *ManifestSandbox,
) (EvaluationManifest, error) {
	scenarioDigest, err := hashPhase0File(filepath.Join(repoRoot, "evals", "scenarios", scenario.ID+".json"))
	if err != nil {
		return EvaluationManifest{}, fmt.Errorf("hash manifest scenario %s: %w", scenario.ID, err)
	}
	fixtureDigest, err := hashManifestWorkspace(filepath.Join(repoRoot, "evals", "fixtures", scenario.Fixture))
	if err != nil {
		return EvaluationManifest{}, fmt.Errorf("hash manifest fixture %s: %w", scenario.Fixture, err)
	}
	rubricDigest, err := hashPhase0File(filepath.Join(repoRoot, filepath.FromSlash(judgeRubricRelativePath)))
	if err != nil {
		return EvaluationManifest{}, fmt.Errorf("hash communication judge rubric: %w", err)
	}
	pin, err := loadPhase1ToolchainPin(repoRoot)
	if err != nil {
		return EvaluationManifest{}, err
	}
	manifestRoles := cloneEvaluatedRoleConfigurations(roles)
	if manifestRoles == nil {
		manifestRoles = []EvaluatedRoleConfiguration{}
	}
	manifest := EvaluationManifest{
		SchemaVersion: ManifestSchemaVersion,
		SettaCommit:   settaCommit,
		StartedAt:     startedAt.UTC(),
		FinishedAt:    finishedAt.UTC(),
		Scenarios: []ManifestScenario{{
			ScenarioID:                scenario.ID,
			ScenarioSHA256:            scenarioDigest,
			Fixture:                   scenario.Fixture,
			FixtureSHA256:             fixtureDigest,
			CommunicationRubricSHA256: rubricDigest,
			Roles:                     manifestRoles,
		}},
		Sandbox: cloneManifestSandbox(sandbox),
		Judge:   FixedJudgeConfiguration(),
		Runtime: ManifestRuntime{
			BackendVersion: phase1BackendVersion,
			CodexVersion:   phase0.BundleVersion,
			NodeVersion:    pin.NodeVersion,
			PNPMVersion:    pin.PNPMVersion,
		},
	}
	if err := manifest.Validate(); err != nil {
		return EvaluationManifest{}, err
	}
	return manifest, nil
}

func newManifestSandbox(repoRoot string, images *phase1Images) (*ManifestSandbox, error) {
	if images == nil || !validPhase1ImageID(images.agentID) ||
		!validPhase1ImageID(images.backendID) || !validPhase1ImageID(images.verifierID) {
		return nil, errors.New("manifest requires all built Phase 1 image ids")
	}
	pin, err := loadPhase1ToolchainPin(repoRoot)
	if err != nil {
		return nil, err
	}
	sandbox := &ManifestSandbox{
		Platform:         phase1ImagePlatform,
		ToolchainImage:   pin.BaseImage,
		ToolchainImageID: pin.BaseImageID,
		AgentImageID:     images.agentID,
		BackendImageID:   images.backendID,
		VerifierImageID:  images.verifierID,
	}
	if err := sandbox.Validate(); err != nil {
		return nil, err
	}
	return sandbox, nil
}

func hashManifestWorkspace(root string) (string, error) {
	snapshot, err := evalverifier.ReadWorkspace(root, evalverifier.SnapshotOptions{})
	if err != nil {
		return "", err
	}
	paths := make([]string, 0, len(snapshot))
	for path := range snapshot {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	hasher := sha256.New()
	for _, path := range paths {
		state := snapshot[path]
		if err := writeManifestHashField(hasher, []byte(path)); err != nil {
			return "", err
		}
		executable := byte(0)
		if state.Executable {
			executable = 1
		}
		if _, err := hasher.Write([]byte{executable}); err != nil {
			return "", err
		}
		if err := writeManifestHashField(hasher, state.Content); err != nil {
			return "", err
		}
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func writeManifestHashField(hasher hash.Hash, value []byte) error {
	if err := binary.Write(hasher, binary.BigEndian, uint64(len(value))); err != nil {
		return err
	}
	_, err := hasher.Write(value)
	return err
}

func (manifest EvaluationManifest) Validate() error {
	if err := validateManifestEnvelope(manifest); err != nil {
		return err
	}
	if err := validateManifestScenarios(manifest.Scenarios); err != nil {
		return err
	}
	if err := validateManifestSandbox(manifest.Sandbox); err != nil {
		return err
	}
	if err := manifest.Judge.Validate(); err != nil {
		return err
	}
	return manifest.Runtime.Validate()
}

func validateManifestEnvelope(manifest EvaluationManifest) error {
	if manifest.SchemaVersion != ManifestSchemaVersion {
		return fmt.Errorf("manifest schemaVersion is %d, want %d", manifest.SchemaVersion, ManifestSchemaVersion)
	}
	if !validGitCommit(manifest.SettaCommit) {
		return errors.New("manifest Setta commit is invalid")
	}
	if err := validateResultTimes(
		"manifest",
		manifest.StartedAt,
		manifest.FinishedAt,
		manifest.FinishedAt.Sub(manifest.StartedAt).Milliseconds(),
	); err != nil {
		return err
	}
	return nil
}

func validateManifestScenarios(scenarios []ManifestScenario) error {
	if scenarios == nil || len(scenarios) == 0 || len(scenarios) > ResultMaximumScenarios {
		return fmt.Errorf("manifest contains %d scenarios, want 1-%d", len(scenarios), ResultMaximumScenarios)
	}
	seen := map[string]bool{}
	for index, scenario := range scenarios {
		if err := scenario.Validate(); err != nil {
			return fmt.Errorf("manifest scenario[%d]: %w", index, err)
		}
		if seen[scenario.ScenarioID] {
			return fmt.Errorf("manifest repeats scenario %q", scenario.ScenarioID)
		}
		seen[scenario.ScenarioID] = true
	}
	return nil
}

func validateManifestSandbox(sandbox *ManifestSandbox) error {
	if sandbox == nil {
		return nil
	}
	return sandbox.Validate()
}

func (scenario ManifestScenario) Validate() error {
	if err := validateScenarioIdentifier("manifest scenario id", scenario.ScenarioID); err != nil {
		return err
	}
	if !validPhase1SHA256(scenario.ScenarioSHA256) || !validPhase1SHA256(scenario.FixtureSHA256) ||
		!validPhase1SHA256(scenario.CommunicationRubricSHA256) {
		return errors.New("manifest scenario requires exact SHA-256 input digests")
	}
	if scenario.Fixture != ScenarioFixtureTypeScriptService {
		return fmt.Errorf("manifest scenario fixture is %q", scenario.Fixture)
	}
	if scenario.Roles == nil {
		return errors.New("manifest scenario roles must be an array, not null")
	}
	if len(scenario.Roles) == 0 {
		return nil
	}
	return validateEvaluatedRoleConfigurations(scenario.Roles, ScenarioExecutionCompleted)
}

func (sandbox ManifestSandbox) Validate() error {
	if sandbox.Platform != phase1ImagePlatform ||
		!validPhase1PinnedImageReference(sandbox.ToolchainImage) ||
		!validPhase1ImageID(sandbox.ToolchainImageID) ||
		!validPhase1ImageID(sandbox.AgentImageID) ||
		!validPhase1ImageID(sandbox.BackendImageID) ||
		!validPhase1ImageID(sandbox.VerifierImageID) {
		return errors.New("manifest sandbox does not contain the exact Phase 1 image identities")
	}
	return nil
}

func (runtime ManifestRuntime) Validate() error {
	if runtime.BackendVersion != phase1BackendVersion || runtime.CodexVersion == "" ||
		!validPhase1ToolVersion(runtime.NodeVersion) || !validPhase1ToolVersion(runtime.PNPMVersion) {
		return errors.New("manifest runtime versions are invalid")
	}
	return nil
}

func cloneManifestSandbox(value *ManifestSandbox) *ManifestSandbox {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
