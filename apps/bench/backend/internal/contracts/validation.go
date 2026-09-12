package contracts

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MaximumCandidates              = 8
	MaximumCases                   = 100
	MaximumChecks                  = 32
	MaximumArtifacts               = 8
	MaximumObservations            = 64
	MaximumJSONValueBytes          = 256 << 10
	MaximumManifestBytes           = 4 << 20
	MaximumManifestLineBytes       = 256 << 10
	MaximumTextBytes               = 1 << 20
	MaximumArtifactBytes     int64 = 64 << 20
	MaximumCaseArtifactBytes int64 = 128 << 20
)

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

func DecodeStrict(data []byte, target any) error {
	if target == nil {
		return errors.New("contracts: target is required")
	}
	if !utf8.Valid(data) {
		return errors.New("contracts: JSON is not valid UTF-8")
	}
	if err := validateUniqueJSON(data); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("contracts: multiple JSON values")
		}
		return err
	}
	return nil
}

func Clone[T any](value T) (T, error) {
	var cloned T
	encoded, err := json.Marshal(value)
	if err != nil {
		return cloned, err
	}
	if err := DecodeStrict(encoded, &cloned); err != nil {
		return cloned, err
	}
	return cloned, nil
}

func validateUniqueJSON(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeUniqueJSONValue(decoder, 0); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("contracts: multiple JSON values")
		}
		return err
	}
	return nil
}

func consumeUniqueJSONValue(decoder *json.Decoder, depth int) error {
	if depth > 32 {
		return errors.New("contracts: JSON nesting exceeds the limit")
	}
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, compound := token.(json.Delim)
	if !compound {
		return nil
	}
	switch delimiter {
	case '{':
		return consumeUniqueJSONObject(decoder, depth)
	case '[':
		return consumeUniqueJSONArray(decoder, depth)
	default:
		return errors.New("contracts: JSON compound value is invalid")
	}
}

func consumeUniqueJSONObject(decoder *json.Decoder, depth int) error {
	fields := map[string]struct{}{}
	for decoder.More() {
		nameToken, err := decoder.Token()
		if err != nil {
			return err
		}
		name, ok := nameToken.(string)
		if !ok {
			return errors.New("contracts: JSON object field name is invalid")
		}
		if _, exists := fields[name]; exists {
			return fmt.Errorf("contracts: JSON object repeats field %q", name)
		}
		fields[name] = struct{}{}
		if err := consumeUniqueJSONValue(decoder, depth+1); err != nil {
			return err
		}
	}
	return consumeClosing(decoder, '}')
}

func consumeUniqueJSONArray(decoder *json.Decoder, depth int) error {
	for decoder.More() {
		if err := consumeUniqueJSONValue(decoder, depth+1); err != nil {
			return err
		}
	}
	return consumeClosing(decoder, ']')
}

func consumeClosing(decoder *json.Decoder, expected json.Delim) error {
	value, err := decoder.Token()
	if err != nil {
		return err
	}
	if value != expected {
		return errors.New("contracts: JSON compound value is not closed")
	}
	return nil
}

func (project ProjectV1) Validate() error {
	if project.Version != ProjectVersion || !ValidID(project.ID) || project.Revision < 0 {
		return errors.New("contracts: project identity is invalid")
	}
	return ProjectDraftV1{
		Name: project.Name, CaseSet: project.CaseSet, Candidates: project.Candidates,
		Evaluator: project.Evaluator, Execution: project.Execution, Presentation: project.Presentation,
	}.Validate()
}

func (draft ProjectDraftV1) Validate() error {
	if err := validateText(draft.Name, 1, 256); err != nil {
		return fmt.Errorf("contracts: project name: %w", err)
	}
	if err := draft.CaseSet.Validate(); err != nil {
		return err
	}
	if len(draft.Candidates) < 2 || len(draft.Candidates) > MaximumCandidates {
		return errors.New("contracts: project must contain between two and eight candidates")
	}
	sectionIDs, err := authoredSectionIDs(draft)
	if err != nil {
		return err
	}
	if err := validateExecutionPolicy(draft.Execution); err != nil {
		return err
	}
	return draft.Presentation.validate(sectionIDs)
}

func authoredSectionIDs(draft ProjectDraftV1) (map[string]struct{}, error) {
	sectionIDs := map[string]struct{}{draft.CaseSet.ID: {}}
	for _, candidate := range draft.Candidates {
		if err := candidate.Validate(); err != nil {
			return nil, err
		}
		if _, exists := sectionIDs[candidate.ID]; exists {
			return nil, errors.New("contracts: authored section identities must be unique")
		}
		sectionIDs[candidate.ID] = struct{}{}
	}
	if draft.Evaluator == nil {
		return sectionIDs, nil
	}
	if err := draft.Evaluator.Validate(); err != nil {
		return nil, err
	}
	if _, exists := sectionIDs[draft.Evaluator.ID]; exists {
		return nil, errors.New("contracts: authored section identities must be unique")
	}
	sectionIDs[draft.Evaluator.ID] = struct{}{}
	return sectionIDs, nil
}

func validateExecutionPolicy(value ExecutionPolicyV1) error {
	if value.Concurrency < 1 || value.Concurrency > 8 {
		return errors.New("contracts: execution concurrency is outside the supported range")
	}
	if value.TimeoutMilliseconds < 100 || value.TimeoutMilliseconds > 300_000 {
		return errors.New("contracts: execution timeout is outside the supported range")
	}
	return nil
}

func (value CaseSetV1) Validate() error {
	if !ValidID(value.ID) {
		return errors.New("contracts: case set id is invalid")
	}
	if err := validateText(value.Name, 1, 256); err != nil {
		return fmt.Errorf("contracts: case set name: %w", err)
	}
	if !validRelativePath(value.Manifest, false) || filepath.Ext(value.Manifest) != ".jsonl" {
		return errors.New("contracts: case manifest path is invalid")
	}
	return nil
}

func (value CandidateV1) Validate() error {
	if !ValidID(value.ID) {
		return errors.New("contracts: candidate id is invalid")
	}
	if err := validateText(value.Name, 1, 256); err != nil {
		return fmt.Errorf("contracts: candidate name: %w", err)
	}
	if err := value.Command.Validate(); err != nil {
		return fmt.Errorf("contracts: candidate %q: %w", value.ID, err)
	}
	if value.Origin != nil {
		if err := value.Origin.Validate(); err != nil {
			return fmt.Errorf("contracts: candidate %q origin: %w", value.ID, err)
		}
	}
	return nil
}

func (value CommandV1) Validate() error {
	if len(value.Argv) < 1 || len(value.Argv) > 32 {
		return errors.New("command argument count is invalid")
	}
	for _, argument := range value.Argv {
		if err := validateText(argument, 1, 4096); err != nil || strings.ContainsRune(argument, '\x00') {
			return errors.New("command argument is invalid")
		}
	}
	if value.WorkingDirectory != "." && !validRelativePath(value.WorkingDirectory, true) {
		return errors.New("command working directory is invalid")
	}
	return nil
}

func (value CandidateOriginV1) Validate() error {
	if value.Application != "python-canvas" || validateText(value.ProjectID, 1, 256) != nil || value.ProjectRevision < 1 || validateText(value.CallableID, 1, 256) != nil {
		return errors.New("source identity is invalid")
	}
	if validateText(value.DeepLink, 1, 4096) != nil {
		return errors.New("source deep link is invalid")
	}
	parsed, err := url.Parse(value.DeepLink)
	if err != nil || parsed.User != nil || parsed.Host == "" || !strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https") {
		return errors.New("source deep link must be an absolute HTTP or HTTPS URL without user information")
	}
	return nil
}

func (value EvaluatorV1) Validate() error {
	if !ValidID(value.ID) {
		return errors.New("contracts: evaluator id is invalid")
	}
	if err := validateText(value.Name, 1, 256); err != nil {
		return fmt.Errorf("contracts: evaluator name: %w", err)
	}
	if value.Checks == nil || len(value.Checks) > MaximumChecks {
		return errors.New("contracts: evaluator checks are invalid")
	}
	seen := map[string]struct{}{}
	for _, check := range value.Checks {
		if err := check.Validate(); err != nil {
			return err
		}
		if _, exists := seen[check.ID]; exists {
			return errors.New("contracts: check identities must be unique")
		}
		seen[check.ID] = struct{}{}
	}
	return nil
}

func (value CheckV1) Validate() error {
	if !ValidID(value.ID) {
		return errors.New("contracts: check id is invalid")
	}
	if err := validateText(value.Name, 1, 256); err != nil {
		return fmt.Errorf("contracts: check name: %w", err)
	}
	if err := validateText(value.ArtifactName, 1, 128); err != nil {
		return fmt.Errorf("contracts: check artifact name: %w", err)
	}
	switch value.Kind {
	case "artifact_max_bytes":
		return validateArtifactByteCheck(value)
	case "image_dimensions":
		return validateImageDimensionCheck(value)
	default:
		return errors.New("contracts: check kind is invalid")
	}
}

func validateArtifactByteCheck(value CheckV1) error {
	if value.MaximumBytes == nil || *value.MaximumBytes < 1 || *value.MaximumBytes > MaximumArtifactBytes || value.Width != nil || value.Height != nil {
		return errors.New("contracts: artifact byte check configuration is invalid")
	}
	return nil
}

func validateImageDimensionCheck(value CheckV1) error {
	if value.Width == nil || value.Height == nil || *value.Width < 1 || *value.Width > 16_384 || *value.Height < 1 || *value.Height > 16_384 || value.MaximumBytes != nil {
		return errors.New("contracts: image dimension check configuration is invalid")
	}
	return nil
}

func (value PresentationV1) validate(expected map[string]struct{}) error {
	if value.Sections == nil || len(value.Sections) != len(expected) {
		return errors.New("contracts: presentation sections do not match authored sections")
	}
	for id, layout := range value.Sections {
		if _, exists := expected[id]; !exists {
			return errors.New("contracts: presentation contains an unknown section")
		}
		if !validSectionLayout(layout) {
			return errors.New("contracts: section layout is invalid")
		}
	}
	if !validViewport(value.Viewport) {
		return errors.New("contracts: presentation viewport is invalid")
	}
	return nil
}

func validSectionLayout(value SectionLayoutV1) bool {
	return finite(value.X) && finite(value.Y) && finite(value.Width) && finite(value.Height) && value.Width >= 160 && value.Width <= 4096 && value.Height >= 96 && value.Height <= 4096 && value.ZIndex >= 0
}

func validViewport(value ViewportV1) bool {
	return finite(value.X) && finite(value.Y) && finite(value.Zoom) && value.Zoom >= 0.1 && value.Zoom <= 4
}

func (value ReplaceProjectRequestV1) Validate() error {
	if !ValidID(value.ProjectID) || value.ExpectedRevision < 0 {
		return errors.New("contracts: project replacement identity is invalid")
	}
	return value.Project.Validate()
}

func (value ImportCandidateRequestV1) Validate() error {
	if !ValidID(value.ProjectID) || value.ExpectedRevision < 0 || strings.TrimSpace(value.BundleDirectory) == "" || value.BundleDirectory != strings.TrimSpace(value.BundleDirectory) || strings.ContainsRune(value.BundleDirectory, '\x00') {
		return errors.New("contracts: candidate import request is invalid")
	}
	return nil
}

func (value CandidateBundleV1) Validate() error {
	if value.Version != BundleVersion {
		return errors.New("contracts: candidate bundle version is unsupported")
	}
	if err := value.Source.Validate(); err != nil {
		return err
	}
	if !ValidID(value.Candidate.ID) {
		return errors.New("contracts: bundled candidate id must use only Bench id characters: letters, digits, dot, underscore, colon, or hyphen")
	}
	if err := value.Candidate.Validate(); err != nil {
		return err
	}
	if value.Candidate.Origin != nil {
		return errors.New("contracts: bundled candidate origin must be supplied by source")
	}
	return nil
}

func (value CaseV1) Validate() error {
	if !ValidID(value.ID) {
		return errors.New("contracts: case id is invalid")
	}
	if err := validateText(value.Name, 1, 256); err != nil {
		return fmt.Errorf("contracts: case name: %w", err)
	}
	if err := validateRawJSON(value.Input, false); err != nil {
		return fmt.Errorf("contracts: case input: %w", err)
	}
	if err := validateRawJSON(value.Expected, true); err != nil {
		return fmt.Errorf("contracts: case expected value: %w", err)
	}
	return nil
}

func (value LaunchRequestV1) Validate() error {
	if !ValidID(value.ProjectID) || value.ExpectedRevision < 0 || len(value.CandidateIDs) < 2 || len(value.CandidateIDs) > MaximumCandidates {
		return errors.New("contracts: launch request is invalid")
	}
	seen := map[string]struct{}{}
	for _, id := range value.CandidateIDs {
		if !ValidID(id) {
			return errors.New("contracts: launch candidate id is invalid")
		}
		if _, exists := seen[id]; exists {
			return errors.New("contracts: launch candidate ids must be unique")
		}
		seen[id] = struct{}{}
	}
	return nil
}

func (value LaunchV1) Validate() error {
	if !validLaunchIdentity(value) {
		return errors.New("contracts: launch identity is invalid")
	}
	if err := value.CaseSet.Validate(); err != nil {
		return err
	}
	if !validLaunchCollectionSizes(value) {
		return errors.New("contracts: launch collections are invalid")
	}
	if err := validateLaunchCases(value.Cases); err != nil {
		return err
	}
	if err := validateLaunchCandidates(value.Candidates, value.RunIDs); err != nil {
		return err
	}
	if value.Evaluator != nil {
		if err := value.Evaluator.Validate(); err != nil {
			return err
		}
	}
	if !validLaunchExecution(value.Execution) {
		return errors.New("contracts: launch execution policy is invalid")
	}
	if value.RerunParentRunID != nil && !ValidID(*value.RerunParentRunID) {
		return errors.New("contracts: rerun parent id is invalid")
	}
	return nil
}

func validLaunchIdentity(value LaunchV1) bool {
	return value.Version == RunRecordVersion && ValidID(value.ID) && ValidID(value.ProjectID) && value.ProjectRevision >= 0 && validateTimestamp(value.CreatedAt) == nil
}

func validLaunchCollectionSizes(value LaunchV1) bool {
	return len(value.Cases) >= 1 && len(value.Cases) <= MaximumCases && len(value.Candidates) >= 1 && len(value.Candidates) <= MaximumCandidates && len(value.RunIDs) == len(value.Candidates)
}

func validateLaunchCases(cases []CaseV1) error {
	caseIDs := map[string]struct{}{}
	for _, item := range cases {
		if err := item.Validate(); err != nil {
			return err
		}
		if _, exists := caseIDs[item.ID]; exists {
			return errors.New("contracts: launch case ids must be unique")
		}
		caseIDs[item.ID] = struct{}{}
	}
	return nil
}

func validateLaunchCandidates(candidates []CandidateV1, runIDs []string) error {
	candidateIDs := map[string]struct{}{}
	seenRunIDs := map[string]struct{}{}
	for index, candidate := range candidates {
		if err := candidate.Validate(); err != nil {
			return err
		}
		_, duplicateCandidate := candidateIDs[candidate.ID]
		_, duplicateRun := seenRunIDs[runIDs[index]]
		if duplicateCandidate || duplicateRun {
			return errors.New("contracts: launch candidate and run identities must be unique")
		}
		if !ValidID(runIDs[index]) {
			return errors.New("contracts: launch run id is invalid")
		}
		candidateIDs[candidate.ID] = struct{}{}
		seenRunIDs[runIDs[index]] = struct{}{}
	}
	return nil
}

func validLaunchExecution(value ExecutionPolicyV1) bool {
	return value.Concurrency >= 1 && value.Concurrency <= 8 && value.TimeoutMilliseconds >= 100 && value.TimeoutMilliseconds <= 300_000
}

func (value ValidationIssueV1) Validate() error {
	if !ValidID(value.Code) || validateText(value.Message, 1, 4096) != nil || validateText(value.Path, 1, 1024) != nil {
		return errors.New("contracts: validation issue is invalid")
	}
	return nil
}

func (value ProjectValidationV1) Validate() error {
	if value.CaseCount < 0 || value.CaseCount > MaximumCases || value.ExecutionCount < 0 || value.ExecutionCount > MaximumCases*MaximumCandidates || value.Issues == nil || len(value.Issues) > MaximumCandidates+1 || value.Ready != (len(value.Issues) == 0) {
		return errors.New("contracts: project validation summary is invalid")
	}
	for _, issue := range value.Issues {
		if err := issue.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (value RunV1) Validate() error {
	if !validRunIdentity(value) {
		return errors.New("contracts: run identity is invalid")
	}
	if err := validateOptionalTimestamp(value.StartedAt); err != nil {
		return err
	}
	if err := validateOptionalTimestamp(value.CompletedAt); err != nil {
		return err
	}
	if len(value.CaseResults) < 1 || len(value.CaseResults) > MaximumCases {
		return errors.New("contracts: run case results are invalid")
	}
	if err := validateRunCaseResults(value.CaseResults); err != nil {
		return err
	}
	if value.RerunParentID != nil && !ValidID(*value.RerunParentID) {
		return errors.New("contracts: run rerun parent id is invalid")
	}
	if value.Error != nil {
		return value.Error.Validate()
	}
	return nil
}

func validRunIdentity(value RunV1) bool {
	return value.Version == RunRecordVersion && ValidID(value.ID) && ValidID(value.LaunchID) && ValidID(value.CandidateID) && validateText(value.CandidateName, 1, 256) == nil && validateTimestamp(value.CreatedAt) == nil && validRunStatus(value.Status)
}

func validateRunCaseResults(results []CaseResultV1) error {
	seen := map[string]struct{}{}
	for _, result := range results {
		if err := result.Validate(); err != nil {
			return err
		}
		if _, exists := seen[result.CaseID]; exists {
			return errors.New("contracts: run case ids must be unique")
		}
		seen[result.CaseID] = struct{}{}
	}
	return nil
}

func (value CaseResultV1) Validate() error {
	if err := validateCaseResultHeader(value); err != nil {
		return err
	}
	if err := validateObservations(value.Observations); err != nil {
		return err
	}
	if err := validateFindings(value.Findings); err != nil {
		return err
	}
	if err := validateArtifacts(value.Artifacts); err != nil {
		return err
	}
	if value.Error != nil {
		return value.Error.Validate()
	}
	return nil
}

func validateCaseResultHeader(value CaseResultV1) error {
	if !validCaseResultIdentity(value) {
		return errors.New("contracts: case result identity or progress is invalid")
	}
	if err := validateCaseResultTiming(value); err != nil {
		return err
	}
	if err := validateRawJSON(value.Output, true); err != nil {
		return err
	}
	if !validCaseResultCollections(value) {
		return errors.New("contracts: case result collections are invalid")
	}
	return nil
}

func validCaseResultIdentity(value CaseResultV1) bool {
	return ValidID(value.CaseID) && validateText(value.CaseName, 1, 256) == nil && validCaseStatus(value.Status) && finite(value.Progress) && value.Progress >= 0 && value.Progress <= 1 && len(value.Message) <= 4096 && utf8.ValidString(value.Message) && len(value.Stderr) <= MaximumTextBytes && utf8.ValidString(value.Stderr)
}

func validateCaseResultTiming(value CaseResultV1) error {
	if err := validateOptionalTimestamp(value.StartedAt); err != nil {
		return err
	}
	if err := validateOptionalTimestamp(value.CompletedAt); err != nil {
		return err
	}
	if value.DurationMilliseconds != nil && *value.DurationMilliseconds < 0 {
		return errors.New("contracts: case duration is invalid")
	}
	return nil
}

func validCaseResultCollections(value CaseResultV1) bool {
	return value.Observations != nil && len(value.Observations) <= MaximumObservations && value.Findings != nil && len(value.Findings) <= MaximumChecks && value.Artifacts != nil && len(value.Artifacts) <= MaximumArtifacts
}

func validateObservations(observations []ObservationV1) error {
	seen := map[string]struct{}{}
	for _, observation := range observations {
		if err := observation.Validate(); err != nil {
			return err
		}
		if _, exists := seen[observation.ID]; exists {
			return errors.New("contracts: observation identities must be unique")
		}
		seen[observation.ID] = struct{}{}
	}
	return nil
}

func validateFindings(findings []FindingV1) error {
	seen := map[string]struct{}{}
	for _, finding := range findings {
		if err := finding.Validate(); err != nil {
			return err
		}
		if _, exists := seen[finding.CheckID]; exists {
			return errors.New("contracts: finding check identities must be unique")
		}
		seen[finding.CheckID] = struct{}{}
	}
	return nil
}

func validateArtifacts(artifacts []ArtifactReferenceV1) error {
	artifactIDs := map[string]struct{}{}
	artifactNames := map[string]struct{}{}
	for _, artifact := range artifacts {
		if err := artifact.Validate(); err != nil {
			return err
		}
		if _, exists := artifactIDs[artifact.ID]; exists {
			return errors.New("contracts: artifact identities must be unique")
		}
		if _, exists := artifactNames[artifact.Name]; exists {
			return errors.New("contracts: artifact names must be unique")
		}
		artifactIDs[artifact.ID] = struct{}{}
		artifactNames[artifact.Name] = struct{}{}
	}
	return nil
}

func (value ObservationV1) Validate() error {
	if !ValidID(value.ID) || validateText(value.Name, 1, 256) != nil {
		return errors.New("contracts: observation identity is invalid")
	}
	switch value.Kind {
	case "number":
		return validateNumberObservation(value)
	case "text":
		return validateTextObservation(value)
	case "boolean":
		return validateBooleanObservation(value)
	default:
		return errors.New("contracts: observation kind is invalid")
	}
}

func validateNumberObservation(value ObservationV1) error {
	if value.NumberValue == nil || !finite(*value.NumberValue) || value.TextValue != nil || value.BooleanValue != nil {
		return errors.New("contracts: numeric observation is invalid")
	}
	return nil
}

func validateTextObservation(value ObservationV1) error {
	if value.NumberValue != nil || value.TextValue == nil || value.BooleanValue != nil || validateText(*value.TextValue, 0, 4096) != nil {
		return errors.New("contracts: text observation is invalid")
	}
	return nil
}

func validateBooleanObservation(value ObservationV1) error {
	if value.NumberValue != nil || value.TextValue != nil || value.BooleanValue == nil {
		return errors.New("contracts: boolean observation is invalid")
	}
	return nil
}

func (value FindingV1) Validate() error {
	if !ValidID(value.CheckID) || validateText(value.CheckName, 1, 256) != nil || value.Status != "passed" && value.Status != "failed" || validateText(value.Message, 1, 4096) != nil {
		return errors.New("contracts: finding is invalid")
	}
	return nil
}

func (value ArtifactReferenceV1) Validate() error {
	if !ValidID(value.ID) || validateText(value.Name, 1, 128) != nil || validateText(value.MediaType, 1, 256) != nil || strings.ContainsAny(value.MediaType, "\r\n") || value.ByteLength < 0 || value.ByteLength > MaximumArtifactBytes || len(value.SHA256) != 64 {
		return errors.New("contracts: artifact reference is invalid")
	}
	_, err := hex.DecodeString(value.SHA256)
	return err
}

func (value ReviewV1) Validate() error {
	if value.Version != ReviewVersion || !ValidID(value.LeftRunID) || !ValidID(value.RightRunID) || value.LeftRunID == value.RightRunID || len(value.Note) > 4096 || !utf8.ValidString(value.Note) || validateTimestamp(value.UpdatedAt) != nil {
		return errors.New("contracts: review is invalid")
	}
	if value.PreferredRunID != nil && *value.PreferredRunID != value.LeftRunID && *value.PreferredRunID != value.RightRunID {
		return errors.New("contracts: preferred run is not part of the comparison")
	}
	return nil
}

func (value PutReviewRequestV1) Validate() error {
	return ReviewV1{Version: ReviewVersion, LeftRunID: value.LeftRunID, RightRunID: value.RightRunID, PreferredRunID: value.PreferredRunID, Note: value.Note, UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano)}.Validate()
}

func (value StructuredErrorV1) Validate() error {
	if !ValidID(value.Code) || validateText(value.Message, 1, 4096) != nil {
		return errors.New("contracts: structured error is invalid")
	}
	return nil
}

func (value CandidateRequestV1) Validate() error {
	if value.ProtocolVersion != CandidateProtocolVersion || !ValidID(value.RunID) || !filepath.IsAbs(value.OutputDirectory) || strings.ContainsRune(value.OutputDirectory, '\x00') {
		return errors.New("contracts: candidate request is invalid")
	}
	return CaseV1{ID: value.Case.ID, Name: value.Case.Name, Input: value.Case.Input, Expected: value.Case.Expected}.Validate()
}

func (value CandidateProgressV1) Validate() error {
	if value.Type != "progress" || !finite(value.Progress) || value.Progress < 0 || value.Progress > 1 || validateText(value.Message, 0, 4096) != nil {
		return errors.New("contracts: candidate progress is invalid")
	}
	return nil
}

func (value CandidateResultV1) Validate() error {
	if !validCandidateResultCollections(value) {
		return errors.New("contracts: candidate result is invalid")
	}
	if err := validateCandidateObservations(value.Observations); err != nil {
		return err
	}
	return validateCandidateArtifacts(value.Artifacts)
}

func validCandidateResultCollections(value CandidateResultV1) bool {
	return value.Type == "result" && validateRawJSON(value.Output, false) == nil && value.Observations != nil && len(value.Observations) < MaximumObservations && value.Artifacts != nil && len(value.Artifacts) <= MaximumArtifacts
}

func validateCandidateObservations(observations []ObservationV1) error {
	seen := map[string]struct{}{}
	for _, observation := range observations {
		if err := observation.Validate(); err != nil {
			return err
		}
		if observation.ID == "duration-ms" {
			return errors.New("contracts: duration-ms is reserved for the host")
		}
		if _, exists := seen[observation.ID]; exists {
			return errors.New("contracts: candidate observation identities must be unique")
		}
		seen[observation.ID] = struct{}{}
	}
	return nil
}

func validateCandidateArtifacts(artifacts []CandidateArtifactV1) error {
	seen := map[string]struct{}{}
	for _, artifact := range artifacts {
		if err := artifact.Validate(); err != nil {
			return err
		}
		if _, exists := seen[artifact.Name]; exists {
			return errors.New("contracts: candidate artifact names must be unique")
		}
		seen[artifact.Name] = struct{}{}
	}
	return nil
}

func (value CandidateArtifactV1) Validate() error {
	if validateText(value.Name, 1, 128) != nil || validateText(value.MediaType, 1, 256) != nil || strings.ContainsAny(value.MediaType, "\r\n") || !validRelativePath(value.Path, false) {
		return errors.New("contracts: candidate artifact is invalid")
	}
	return nil
}

func (value CandidateErrorV1) Validate() error {
	if value.Type != "error" {
		return errors.New("contracts: candidate error type is invalid")
	}
	return StructuredErrorV1{Code: value.Code, Message: value.Message}.Validate()
}

func ValidID(value string) bool {
	return idPattern.MatchString(value)
}

func validateText(value string, minimum int, maximum int) error {
	if !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') || len(value) < minimum || len(value) > maximum || value != strings.TrimSpace(value) && minimum > 0 {
		return errors.New("text is invalid")
	}
	return nil
}

func validRelativePath(value string, allowDot bool) bool {
	if value == "" || value != strings.TrimSpace(value) || filepath.IsAbs(value) || strings.ContainsRune(value, '\x00') || filepath.Clean(value) != value {
		return false
	}
	if value == "." {
		return allowDot
	}
	return value != ".." && !strings.HasPrefix(value, ".."+string(filepath.Separator))
}

func validateRawJSON(value json.RawMessage, nullable bool) error {
	if len(value) == 0 {
		if nullable {
			return nil
		}
		return errors.New("JSON value is missing")
	}
	if len(value) > MaximumJSONValueBytes {
		return errors.New("JSON value exceeds the byte limit")
	}
	if bytes.Equal(bytes.TrimSpace(value), []byte("null")) && nullable {
		return nil
	}
	var decoded any
	if err := DecodeStrict(value, &decoded); err != nil {
		return err
	}
	return nil
}

func validateTimestamp(value string) error {
	if value == "" {
		return errors.New("contracts: timestamp is missing")
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err
}

func validateOptionalTimestamp(value *string) error {
	if value == nil {
		return nil
	}
	return validateTimestamp(*value)
}

func validRunStatus(value string) bool {
	switch value {
	case "queued", "running", "completed", "failed", "canceled", "interrupted":
		return true
	default:
		return false
	}
}

func RunTerminal(value string) bool {
	switch value {
	case "completed", "failed", "canceled", "interrupted":
		return true
	default:
		return false
	}
}

func validCaseStatus(value string) bool {
	switch value {
	case "queued", "running", "succeeded", "failed", "canceled", "timed_out", "interrupted":
		return true
	default:
		return false
	}
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
