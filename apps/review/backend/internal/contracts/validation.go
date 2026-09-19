package contracts

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"path"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maximumRequests      = 128
	maximumClaims        = 256
	maximumOptions       = 64
	maximumFactors       = 32
	maximumEvidence      = 512
	maximumRelations     = 2048
	maximumAssessments   = 4096
	maximumAnnotations   = 256
	maximumPaths         = 512
	maximumPoints        = 8192
	maximumOperations    = 128
	maximumResolvedBytes = 4 << 20
	maximumTextBytes     = 1 << 20
	maximumPathBytes     = 1024
	maximumEvidenceLines = 10000
	maximumJSONDepth     = 32
)

var (
	idPattern          = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
	gitRevisionPattern = regexp.MustCompile(`^[0-9a-f]{40}([0-9a-f]{24})?$`)
	mediaTypePattern   = regexp.MustCompile(`^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$`)
	colorPattern       = regexp.MustCompile(`^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`)
)

func DecodeStrict(data []byte, target any) error {
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
	if depth > maximumJSONDepth {
		return errors.New("contracts: JSON exceeds the nesting limit")
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
		fields := map[string]struct{}{}
		for decoder.More() {
			nameToken, fieldErr := decoder.Token()
			if fieldErr != nil {
				return fieldErr
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
		return consumeClosingDelimiter(decoder, '}')
	case '[':
		for decoder.More() {
			if err := consumeUniqueJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
		return consumeClosingDelimiter(decoder, ']')
	default:
		return errors.New("contracts: JSON compound value is invalid")
	}
}

func consumeClosingDelimiter(decoder *json.Decoder, expected byte) error {
	closing, err := decoder.Token()
	if err != nil {
		return err
	}
	if closing != json.Delim(expected) {
		return errors.New("contracts: JSON compound value is not closed")
	}
	return nil
}

func (manifest ProjectManifest) Validate() error {
	if manifest.Version != ContractVersion {
		return fmt.Errorf("contracts: unsupported project manifest version %d", manifest.Version)
	}
	if !validID(manifest.ID) {
		return errors.New("contracts: project id is invalid")
	}
	if err := validateRequiredText(manifest.Name); err != nil {
		return fmt.Errorf("contracts: project name: %w", err)
	}
	if len(manifest.Requests) == 0 || len(manifest.Requests) > maximumRequests {
		return errors.New("contracts: request paths are missing or exceed the limit")
	}
	seen := map[string]struct{}{}
	for _, requestPath := range manifest.Requests {
		if err := validateRelativePath(requestPath, false); err != nil {
			return fmt.Errorf("contracts: request path %q: %w", requestPath, err)
		}
		if _, exists := seen[requestPath]; exists {
			return fmt.Errorf("contracts: request path %q is repeated", requestPath)
		}
		seen[requestPath] = struct{}{}
	}
	return nil
}

func (request ReviewRequest) Validate() error {
	if request.Version != ContractVersion {
		return fmt.Errorf("contracts: unsupported review request version %d", request.Version)
	}
	if !validID(request.ID) {
		return errors.New("contracts: request id is invalid")
	}
	if err := validateRequiredText(request.Title); err != nil {
		return fmt.Errorf("contracts: request title: %w", err)
	}
	if err := validateRequiredText(request.RequestedDecision); err != nil {
		return fmt.Errorf("contracts: requested decision: %w", err)
	}
	if err := request.Provenance.Validate(); err != nil {
		return fmt.Errorf("contracts: request provenance: %w", err)
	}
	evidence, err := validateEvidence(request.Evidence)
	if err != nil {
		return err
	}
	subjects := map[string]map[string]struct{}{}
	switch request.Type {
	case "completion":
		if request.Completion == nil || request.Choice != nil {
			return errors.New("contracts: completion request body is invalid")
		}
		subjects, err = request.Completion.validate()
	case "choice":
		if request.Choice == nil || request.Completion != nil {
			return errors.New("contracts: choice request body is invalid")
		}
		subjects, err = request.Choice.validate(evidence)
	default:
		return errors.New("contracts: request type is unsupported")
	}
	if err != nil {
		return err
	}
	return validateRelations(request.Relations, evidence, subjects)
}

func (completion CompletionRequest) validate() (map[string]map[string]struct{}, error) {
	if len(completion.Claims) == 0 || len(completion.Claims) > maximumClaims {
		return nil, errors.New("contracts: completion claims are missing or exceed the limit")
	}
	claims := map[string]struct{}{}
	for _, claim := range completion.Claims {
		if !validID(claim.ID) {
			return nil, errors.New("contracts: completion claim id is invalid")
		}
		if _, exists := claims[claim.ID]; exists {
			return nil, fmt.Errorf("contracts: completion claim %q is repeated", claim.ID)
		}
		if err := validateRequiredText(claim.Text); err != nil {
			return nil, fmt.Errorf("contracts: completion claim %q: %w", claim.ID, err)
		}
		claims[claim.ID] = struct{}{}
	}
	return map[string]map[string]struct{}{"claim": claims}, nil
}

func (choice ChoiceRequest) validate(evidence map[string]EvidenceReference) (map[string]map[string]struct{}, error) {
	if !slices.Contains([]string{"matrix", "artifacts"}, choice.Presentation) {
		return nil, errors.New("contracts: choice presentation is unsupported")
	}
	if !slices.Contains([]string{"selection", "ranking", "approval"}, choice.ExpectedResponse) {
		return nil, errors.New("contracts: choice expected response is unsupported")
	}
	if len(choice.Options) < 2 || len(choice.Options) > maximumOptions {
		return nil, errors.New("contracts: choice options are missing or exceed the limit")
	}
	if choice.Factors == nil || len(choice.Factors) > maximumFactors {
		return nil, errors.New("contracts: choice factors are missing or exceed the limit")
	}
	if choice.Tradeoffs == nil || len(choice.Tradeoffs) > maximumOptions*maximumFactors {
		return nil, errors.New("contracts: choice tradeoffs are missing or exceed the limit")
	}
	options := map[string]struct{}{}
	for _, option := range choice.Options {
		if !validID(option.ID) {
			return nil, errors.New("contracts: choice option id is invalid")
		}
		if _, exists := options[option.ID]; exists {
			return nil, fmt.Errorf("contracts: choice option %q is repeated", option.ID)
		}
		if err := validateRequiredText(option.Label); err != nil {
			return nil, fmt.Errorf("contracts: choice option %q label: %w", option.ID, err)
		}
		if err := validateText(option.Description); err != nil {
			return nil, fmt.Errorf("contracts: choice option %q description: %w", option.ID, err)
		}
		if option.ArtifactEvidenceID != nil {
			reference, exists := evidence[*option.ArtifactEvidenceID]
			if !exists || reference.Kind != "artifact" {
				return nil, fmt.Errorf("contracts: choice option %q references a missing artifact", option.ID)
			}
		}
		options[option.ID] = struct{}{}
	}
	factors := map[string]struct{}{}
	for _, factor := range choice.Factors {
		if !validID(factor.ID) {
			return nil, errors.New("contracts: choice factor id is invalid")
		}
		if _, exists := factors[factor.ID]; exists {
			return nil, fmt.Errorf("contracts: choice factor %q is repeated", factor.ID)
		}
		if err := validateRequiredText(factor.Label); err != nil {
			return nil, fmt.Errorf("contracts: choice factor %q label: %w", factor.ID, err)
		}
		if err := validateText(factor.Description); err != nil {
			return nil, fmt.Errorf("contracts: choice factor %q description: %w", factor.ID, err)
		}
		factors[factor.ID] = struct{}{}
	}
	if choice.Presentation == "matrix" && len(factors) == 0 {
		return nil, errors.New("contracts: matrix choice requires factors")
	}
	tradeoffs := map[string]struct{}{}
	for _, tradeoff := range choice.Tradeoffs {
		if _, exists := options[tradeoff.OptionID]; !exists {
			return nil, fmt.Errorf("contracts: tradeoff references missing option %q", tradeoff.OptionID)
		}
		if _, exists := factors[tradeoff.FactorID]; !exists {
			return nil, fmt.Errorf("contracts: tradeoff references missing factor %q", tradeoff.FactorID)
		}
		key := tradeoff.OptionID + "\x00" + tradeoff.FactorID
		if _, exists := tradeoffs[key]; exists {
			return nil, fmt.Errorf("contracts: tradeoff for option %q and factor %q is repeated", tradeoff.OptionID, tradeoff.FactorID)
		}
		if err := validateRequiredText(tradeoff.Value); err != nil {
			return nil, fmt.Errorf("contracts: tradeoff value: %w", err)
		}
		if !slices.Contains([]string{"support", "risk", "tradeoff", "neutral"}, tradeoff.Tone) {
			return nil, errors.New("contracts: tradeoff tone is unsupported")
		}
		tradeoffs[key] = struct{}{}
	}
	if choice.Presentation == "matrix" && len(tradeoffs) != len(options)*len(factors) {
		return nil, errors.New("contracts: matrix choice must provide every option and factor tradeoff")
	}
	if choice.Presentation == "artifacts" {
		for _, option := range choice.Options {
			if option.ArtifactEvidenceID == nil {
				return nil, fmt.Errorf("contracts: artifact choice option %q has no artifact", option.ID)
			}
		}
	}
	if choice.Recommendation != nil {
		if _, exists := options[choice.Recommendation.OptionID]; !exists {
			return nil, errors.New("contracts: recommendation references a missing option")
		}
		if err := validateRequiredText(choice.Recommendation.Rationale); err != nil {
			return nil, fmt.Errorf("contracts: recommendation rationale: %w", err)
		}
	}
	return map[string]map[string]struct{}{"option": options, "factor": factors}, nil
}

func validateEvidence(references []EvidenceReference) (map[string]EvidenceReference, error) {
	if references == nil || len(references) > maximumEvidence {
		return nil, errors.New("contracts: evidence is missing or exceeds the limit")
	}
	result := make(map[string]EvidenceReference, len(references))
	for _, reference := range references {
		if err := reference.Validate(); err != nil {
			return nil, fmt.Errorf("contracts: evidence %q: %w", reference.ID, err)
		}
		if _, exists := result[reference.ID]; exists {
			return nil, fmt.Errorf("contracts: evidence %q is repeated", reference.ID)
		}
		result[reference.ID] = reference
	}
	return result, nil
}

func (reference EvidenceReference) Validate() error {
	if !validID(reference.ID) {
		return errors.New("id is invalid")
	}
	count := 0
	for _, present := range []bool{reference.GitDiff != nil, reference.Text != nil, reference.JSON != nil, reference.Artifact != nil} {
		if present {
			count++
		}
	}
	if count != 1 {
		return errors.New("body is invalid")
	}
	switch reference.Kind {
	case "gitDiff":
		if reference.GitDiff == nil {
			return errors.New("git diff body is missing")
		}
		return reference.GitDiff.Validate()
	case "text":
		if reference.Text == nil {
			return errors.New("text body is missing")
		}
		return reference.Text.Validate()
	case "json":
		if reference.JSON == nil {
			return errors.New("JSON body is missing")
		}
		return reference.JSON.Validate()
	case "artifact":
		if reference.Artifact == nil {
			return errors.New("artifact body is missing")
		}
		return reference.Artifact.Validate()
	default:
		return errors.New("kind is unsupported")
	}
}

func (reference GitDiffEvidenceReference) Validate() error {
	if err := validateRelativePath(reference.RepositoryPath, true); err != nil {
		return fmt.Errorf("repository path: %w", err)
	}
	if !gitRevisionPattern.MatchString(reference.BaseRevision) {
		return errors.New("base revision is not an exact Git object id")
	}
	if reference.TargetRevision != nil && !gitRevisionPattern.MatchString(*reference.TargetRevision) {
		return errors.New("target revision is not an exact Git object id")
	}
	if err := validateRelativePath(reference.Path, false); err != nil {
		return fmt.Errorf("path: %w", err)
	}
	if reference.ContextLines < 0 || reference.ContextLines > 20 {
		return errors.New("context lines are outside the limit")
	}
	return reference.Hunk.Validate()
}

func (hunk GitHunk) Validate() error {
	if hunk.OldStart < 0 || hunk.NewStart < 0 || hunk.OldLines < 0 || hunk.NewLines < 0 {
		return errors.New("contracts: Git hunk range is invalid")
	}
	if hunk.OldLines+hunk.NewLines == 0 || hunk.OldLines+hunk.NewLines > maximumEvidenceLines {
		return errors.New("contracts: Git hunk is empty or exceeds the limit")
	}
	return nil
}

func (reference TextEvidenceReference) Validate() error {
	if err := validateRelativePath(reference.Path, false); err != nil {
		return fmt.Errorf("path: %w", err)
	}
	if !mediaTypePattern.MatchString(reference.MediaType) || !strings.HasPrefix(reference.MediaType, "text/") {
		return errors.New("media type must be text")
	}
	return validateLineRange(reference.StartLine, reference.EndLine)
}

func (reference JSONEvidenceReference) Validate() error {
	if err := validateRelativePath(reference.Path, false); err != nil {
		return fmt.Errorf("path: %w", err)
	}
	if reference.Pointers == nil || len(reference.Pointers) > 64 {
		return errors.New("JSON pointers are missing or exceed the limit")
	}
	seen := map[string]struct{}{}
	for _, pointer := range reference.Pointers {
		if !validJSONPointer(pointer) {
			return fmt.Errorf("JSON pointer %q is invalid", pointer)
		}
		if _, exists := seen[pointer]; exists {
			return fmt.Errorf("JSON pointer %q is repeated", pointer)
		}
		seen[pointer] = struct{}{}
	}
	return nil
}

func (reference ArtifactEvidenceReference) Validate() error {
	if err := validateRelativePath(reference.Path, false); err != nil {
		return fmt.Errorf("path: %w", err)
	}
	if !mediaTypePattern.MatchString(reference.MediaType) {
		return errors.New("media type is invalid")
	}
	if reference.ByteLength < 0 {
		return errors.New("byte length is invalid")
	}
	if !validSHA256(reference.SHA256) {
		return errors.New("SHA-256 is invalid")
	}
	return nil
}

func validateRelations(relations []EvidenceRelation, evidence map[string]EvidenceReference, subjects map[string]map[string]struct{}) error {
	if relations == nil || len(relations) > maximumRelations {
		return errors.New("contracts: evidence relations are missing or exceed the limit")
	}
	seen := map[string]struct{}{}
	for _, relation := range relations {
		if !validID(relation.ID) {
			return errors.New("contracts: relation id is invalid")
		}
		if _, exists := seen[relation.ID]; exists {
			return fmt.Errorf("contracts: relation %q is repeated", relation.ID)
		}
		validSubjects, kindExists := subjects[relation.SubjectKind]
		_, subjectExists := validSubjects[relation.SubjectID]
		if !kindExists || !subjectExists {
			return fmt.Errorf("contracts: relation %q references a missing subject", relation.ID)
		}
		reference, exists := evidence[relation.EvidenceID]
		if !exists {
			return fmt.Errorf("contracts: relation %q references missing evidence", relation.ID)
		}
		if !slices.Contains([]string{"supports", "challenges", "qualifies", "informs"}, relation.Role) {
			return fmt.Errorf("contracts: relation %q role is unsupported", relation.ID)
		}
		if len(relation.Citations) > 64 {
			return fmt.Errorf("contracts: relation %q citations exceed the limit", relation.ID)
		}
		for _, citation := range relation.Citations {
			if err := citation.validate(reference.Kind); err != nil {
				return fmt.Errorf("contracts: relation %q citation: %w", relation.ID, err)
			}
		}
		seen[relation.ID] = struct{}{}
	}
	return nil
}

func (citation EvidenceCitation) validate(evidenceKind string) error {
	switch citation.Kind {
	case "lineRange":
		if evidenceKind != "gitDiff" && evidenceKind != "text" {
			return errors.New("line citation requires Git diff or text evidence")
		}
		if citation.StartLine == nil || citation.EndLine == nil || citation.Pointer != nil {
			return errors.New("line citation body is invalid")
		}
		return validateLineRange(*citation.StartLine, *citation.EndLine)
	case "jsonPointer":
		if evidenceKind != "json" || citation.Pointer == nil || citation.StartLine != nil || citation.EndLine != nil || !validJSONPointer(*citation.Pointer) {
			return errors.New("JSON pointer citation body is invalid")
		}
		return nil
	default:
		return errors.New("kind is unsupported")
	}
}

func (provenance Provenance) Validate() error {
	if err := provenance.Producer.Validate(); err != nil {
		return err
	}
	if _, err := time.Parse(time.RFC3339Nano, provenance.CreatedAt); err != nil {
		return errors.New("created time is invalid")
	}
	return nil
}

func (producer ProducerIdentity) Validate() error {
	if !slices.Contains([]string{"human", "agent", "application", "script"}, producer.Kind) {
		return errors.New("producer kind is unsupported")
	}
	if err := validateRequiredText(producer.Name); err != nil {
		return fmt.Errorf("producer name: %w", err)
	}
	if producer.Model != nil {
		if err := validateRequiredText(*producer.Model); err != nil {
			return fmt.Errorf("producer model: %w", err)
		}
	}
	if producer.Harness != nil {
		if err := validateRequiredText(*producer.Harness); err != nil {
			return fmt.Errorf("producer harness: %w", err)
		}
	}
	if producer.Kind == "agent" && (producer.Model == nil || producer.Harness == nil) {
		return errors.New("agent producer requires model and harness")
	}
	if producer.Kind != "agent" && (producer.Model != nil || producer.Harness != nil) {
		return errors.New("non-agent producer cannot declare model or harness")
	}
	return nil
}

func (assessment ExternalAssessment) Validate() error {
	if assessment.Version != ContractVersion || !validID(assessment.ID) || !validID(assessment.RequestID) || !validID(assessment.ClaimID) {
		return errors.New("contracts: external assessment identity is invalid")
	}
	if !slices.Contains([]string{"supported", "contradicted", "unproven", "qualified"}, assessment.Assessment) {
		return errors.New("contracts: external assessment value is unsupported")
	}
	if err := validateText(assessment.Rationale); err != nil {
		return fmt.Errorf("contracts: external assessment rationale: %w", err)
	}
	if err := validateRequiredText(assessment.Producer.Model); err != nil {
		return fmt.Errorf("contracts: external assessment model: %w", err)
	}
	if err := validateRequiredText(assessment.Producer.Harness); err != nil {
		return fmt.Errorf("contracts: external assessment harness: %w", err)
	}
	if _, err := time.Parse(time.RFC3339Nano, assessment.CreatedAt); err != nil {
		return errors.New("contracts: external assessment created time is invalid")
	}
	if assessment.Caveat != nil {
		if err := validateRequiredText(*assessment.Caveat); err != nil {
			return fmt.Errorf("contracts: external assessment caveat: %w", err)
		}
	}
	if assessment.Assessment == "qualified" && assessment.Caveat == nil {
		return errors.New("contracts: qualified assessment requires a caveat")
	}
	if assessment.Assessment != "qualified" && assessment.Caveat != nil {
		return errors.New("contracts: only a qualified assessment can include a caveat")
	}
	return nil
}

func (response ReviewResponse) Validate() error {
	if response.Version != ContractVersion || !validID(response.ID) || !validID(response.RequestID) || !validSHA256(response.RequestSHA256) {
		return errors.New("contracts: response identity is invalid")
	}
	if !slices.Contains([]string{"draft", "final"}, response.Status) {
		return errors.New("contracts: response status is unsupported")
	}
	if err := validateText(response.Rationale); err != nil {
		return fmt.Errorf("contracts: response rationale: %w", err)
	}
	if err := response.Provenance.Validate(); err != nil {
		return fmt.Errorf("contracts: response provenance: %w", err)
	}
	if len(response.Unresolved) > maximumClaims+maximumOptions+maximumFactors {
		return errors.New("contracts: unresolved items exceed the limit")
	}
	for _, item := range response.Unresolved {
		if !slices.Contains([]string{"request", "claim", "option", "factor"}, item.SubjectKind) || !validID(item.SubjectID) {
			return errors.New("contracts: unresolved item subject is invalid")
		}
		if err := validateRequiredText(item.Reason); err != nil {
			return fmt.Errorf("contracts: unresolved item: %w", err)
		}
	}
	if err := validateAnnotations(response.Annotations); err != nil {
		return err
	}
	switch response.Type {
	case "completion":
		if response.Completion == nil || response.Choice != nil {
			return errors.New("contracts: completion response body is invalid")
		}
		return response.Completion.Validate()
	case "choice":
		if response.Choice == nil || response.Completion != nil {
			return errors.New("contracts: choice response body is invalid")
		}
		return response.Choice.Validate()
	default:
		return errors.New("contracts: response type is unsupported")
	}
}

func (response CompletionResponse) Validate() error {
	if response.Decisions == nil || len(response.Decisions) > maximumClaims {
		return errors.New("contracts: completion decisions are missing or exceed the limit")
	}
	seen := map[string]struct{}{}
	for _, decision := range response.Decisions {
		if !validID(decision.ClaimID) || !slices.Contains([]string{"accepted", "qualified", "rejected", "needsEvidence"}, decision.Decision) {
			return errors.New("contracts: completion decision is invalid")
		}
		if _, exists := seen[decision.ClaimID]; exists {
			return fmt.Errorf("contracts: completion decision for claim %q is repeated", decision.ClaimID)
		}
		if err := validateText(decision.Rationale); err != nil {
			return fmt.Errorf("contracts: completion decision rationale: %w", err)
		}
		if decision.Qualification != nil {
			if err := validateRequiredText(*decision.Qualification); err != nil {
				return fmt.Errorf("contracts: completion qualification: %w", err)
			}
		}
		if decision.Decision == "qualified" && decision.Qualification == nil {
			return errors.New("contracts: qualified completion decision requires a qualification")
		}
		if decision.Decision != "qualified" && decision.Qualification != nil {
			return errors.New("contracts: only a qualified completion decision can include a qualification")
		}
		seen[decision.ClaimID] = struct{}{}
	}
	return nil
}

func (response ChoiceResponse) Validate() error {
	if !slices.Contains([]string{"selected", "ranked", "rejected", "qualified", "changesRequested"}, response.Outcome) {
		return errors.New("contracts: choice outcome is unsupported")
	}
	if response.OptionIDs == nil || response.Conditions == nil || response.SelectedArtifactEvidenceIDs == nil {
		return errors.New("contracts: choice response collections are missing")
	}
	if err := validateUniqueIDs(response.OptionIDs, maximumOptions, "choice response option"); err != nil {
		return err
	}
	if err := validateUniqueIDs(response.SelectedArtifactEvidenceIDs, maximumOptions, "selected artifact evidence"); err != nil {
		return err
	}
	if len(response.Conditions) > maximumClaims {
		return errors.New("contracts: choice response conditions exceed the limit")
	}
	for _, condition := range response.Conditions {
		if err := validateRequiredText(condition); err != nil {
			return fmt.Errorf("contracts: choice response condition: %w", err)
		}
	}
	switch response.Outcome {
	case "selected":
		if len(response.OptionIDs) == 0 {
			return errors.New("contracts: selected choice has no option")
		}
	case "ranked":
		if len(response.OptionIDs) < 2 {
			return errors.New("contracts: ranked choice requires at least two options")
		}
	case "qualified":
		if len(response.OptionIDs) == 0 || len(response.Conditions) == 0 {
			return errors.New("contracts: qualified choice requires an option and condition")
		}
	case "rejected", "changesRequested":
		if len(response.OptionIDs) != 0 || len(response.SelectedArtifactEvidenceIDs) != 0 {
			return errors.New("contracts: rejected or revision-requested choice cannot select options or artifacts")
		}
	}
	return nil
}

func validateAnnotations(annotations []ArtifactAnnotation) error {
	if annotations == nil || len(annotations) > maximumAnnotations {
		return errors.New("contracts: annotations are missing or exceed the limit")
	}
	seen := map[string]struct{}{}
	for _, annotation := range annotations {
		if !validID(annotation.ID) || !validID(annotation.ArtifactEvidenceID) || !validSHA256(annotation.ArtifactSHA256) {
			return errors.New("contracts: annotation identity is invalid")
		}
		if _, exists := seen[annotation.ID]; exists {
			return fmt.Errorf("contracts: annotation %q is repeated", annotation.ID)
		}
		if len(annotation.Paths) == 0 || len(annotation.Paths) > maximumPaths {
			return fmt.Errorf("contracts: annotation %q paths are missing or exceed the limit", annotation.ID)
		}
		for _, normalizedPath := range annotation.Paths {
			if err := normalizedPath.Validate(); err != nil {
				return fmt.Errorf("contracts: annotation %q: %w", annotation.ID, err)
			}
		}
		seen[annotation.ID] = struct{}{}
	}
	return nil
}

func (normalizedPath NormalizedPath) Validate() error {
	if !colorPattern.MatchString(normalizedPath.Color) || !finite(normalizedPath.Width) || normalizedPath.Width <= 0 || normalizedPath.Width > 0.1 {
		return errors.New("normalized path style is invalid")
	}
	if len(normalizedPath.Points) < 2 || len(normalizedPath.Points) > maximumPoints {
		return errors.New("normalized path points are missing or exceed the limit")
	}
	for _, point := range normalizedPath.Points {
		if !finite(point.X) || !finite(point.Y) || point.X < 0 || point.X > 1 || point.Y < 0 || point.Y > 1 {
			return errors.New("normalized path point is outside the artifact")
		}
	}
	return nil
}

func (mutation ReviewMutation) Validate() error {
	if !validID(mutation.ProjectID) {
		return errors.New("contracts: mutation project id is invalid")
	}
	if len(mutation.Operations) == 0 || len(mutation.Operations) > maximumOperations {
		return errors.New("contracts: mutation operations are missing or exceed the limit")
	}
	for index, raw := range mutation.Operations {
		if err := validateOperation(raw); err != nil {
			return fmt.Errorf("contracts: operation %d: %w", index, err)
		}
	}
	return nil
}

func validateOperation(raw json.RawMessage) error {
	var discriminator struct {
		Operation string `json:"op"`
	}
	if err := json.Unmarshal(raw, &discriminator); err != nil {
		return err
	}
	switch discriminator.Operation {
	case "importAssessment":
		var operation ImportAssessmentOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		return operation.Assessment.Validate()
	case "setResponse":
		var operation SetResponseOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		return operation.Response.Validate()
	case "deleteResponse":
		var operation DeleteResponseOperation
		if err := DecodeStrict(raw, &operation); err != nil {
			return err
		}
		if !validID(operation.RequestID) {
			return errors.New("response request id is invalid")
		}
		return nil
	default:
		return fmt.Errorf("unsupported operation %q", discriminator.Operation)
	}
}

func (snapshot ReviewSnapshot) Validate() error {
	if snapshot.Version != ContractVersion {
		return fmt.Errorf("contracts: unsupported snapshot version %d", snapshot.Version)
	}
	if err := snapshot.Project.Validate(); err != nil {
		return err
	}
	if len(snapshot.Requests) != len(snapshot.Project.Requests) {
		return errors.New("contracts: snapshot requests do not match the project manifest")
	}
	byPath := map[string]struct{}{}
	requestIDs := map[string]struct{}{}
	for _, requestSnapshot := range snapshot.Requests {
		if err := requestSnapshot.Validate(); err != nil {
			return fmt.Errorf("contracts: request snapshot %q: %w", requestSnapshot.Path, err)
		}
		if _, exists := byPath[requestSnapshot.Path]; exists {
			return fmt.Errorf("contracts: request snapshot path %q is repeated", requestSnapshot.Path)
		}
		if _, exists := requestIDs[requestSnapshot.Request.ID]; exists {
			return fmt.Errorf("contracts: request id %q is repeated", requestSnapshot.Request.ID)
		}
		byPath[requestSnapshot.Path] = struct{}{}
		requestIDs[requestSnapshot.Request.ID] = struct{}{}
	}
	for _, requestPath := range snapshot.Project.Requests {
		if _, exists := byPath[requestPath]; !exists {
			return fmt.Errorf("contracts: project request path %q has no snapshot", requestPath)
		}
	}
	return nil
}

func (snapshot RequestSnapshot) Validate() error {
	if err := validateRelativePath(snapshot.Path, false); err != nil {
		return fmt.Errorf("request path: %w", err)
	}
	if !validSHA256(snapshot.SHA256) {
		return errors.New("request SHA-256 is invalid")
	}
	if err := snapshot.Request.Validate(); err != nil {
		return err
	}
	if snapshot.Assessments == nil || len(snapshot.Assessments) > maximumAssessments {
		return errors.New("assessments are missing or exceed the limit")
	}
	claimIDs := map[string]struct{}{}
	if snapshot.Request.Completion != nil {
		for _, claim := range snapshot.Request.Completion.Claims {
			claimIDs[claim.ID] = struct{}{}
		}
	}
	assessmentIDs := map[string]struct{}{}
	for _, assessment := range snapshot.Assessments {
		if err := assessment.Validate(); err != nil {
			return err
		}
		if assessment.RequestID != snapshot.Request.ID {
			return errors.New("assessment request identity does not match")
		}
		if _, exists := claimIDs[assessment.ClaimID]; !exists {
			return fmt.Errorf("assessment references missing claim %q", assessment.ClaimID)
		}
		if _, exists := assessmentIDs[assessment.ID]; exists {
			return fmt.Errorf("assessment %q is repeated", assessment.ID)
		}
		assessmentIDs[assessment.ID] = struct{}{}
	}
	if snapshot.Response != nil {
		if err := validateResponseForRequest(*snapshot.Response, snapshot.Request, snapshot.SHA256); err != nil {
			return err
		}
	}
	if len(snapshot.Evidence) != len(snapshot.Request.Evidence) {
		return errors.New("resolved evidence does not cover every request reference")
	}
	resolved := map[string]struct{}{}
	for _, evidence := range snapshot.Evidence {
		if err := evidence.Validate(); err != nil {
			return err
		}
		if _, exists := resolved[evidence.EvidenceID]; exists {
			return fmt.Errorf("resolved evidence %q is repeated", evidence.EvidenceID)
		}
		found := false
		for _, reference := range snapshot.Request.Evidence {
			if reference.ID == evidence.EvidenceID {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("resolved evidence %q is not in the request", evidence.EvidenceID)
		}
		resolved[evidence.EvidenceID] = struct{}{}
	}
	return nil
}

func validateResponseForRequest(response ReviewResponse, request ReviewRequest, requestSHA256 string) error {
	if err := response.Validate(); err != nil {
		return err
	}
	if response.RequestID != request.ID || response.RequestSHA256 != requestSHA256 || response.Type != request.Type {
		return errors.New("contracts: response does not match its immutable request")
	}
	evidence := map[string]EvidenceReference{}
	for _, reference := range request.Evidence {
		evidence[reference.ID] = reference
	}
	claims := map[string]struct{}{}
	options := map[string]ChoiceOption{}
	factors := map[string]struct{}{}
	if response.Completion != nil {
		for _, claim := range request.Completion.Claims {
			claims[claim.ID] = struct{}{}
		}
		for _, decision := range response.Completion.Decisions {
			if _, exists := claims[decision.ClaimID]; !exists {
				return fmt.Errorf("contracts: response references missing claim %q", decision.ClaimID)
			}
		}
	}
	if response.Choice != nil {
		for _, option := range request.Choice.Options {
			options[option.ID] = option
		}
		for _, factor := range request.Choice.Factors {
			factors[factor.ID] = struct{}{}
		}
		for _, optionID := range response.Choice.OptionIDs {
			if _, exists := options[optionID]; !exists {
				return fmt.Errorf("contracts: response references missing option %q", optionID)
			}
		}
		if request.Choice.ExpectedResponse == "ranking" && response.Choice.Outcome == "selected" {
			return errors.New("contracts: ranking request cannot use a selected outcome")
		}
		if request.Choice.ExpectedResponse != "ranking" && response.Choice.Outcome == "ranked" {
			return errors.New("contracts: non-ranking request cannot use a ranked outcome")
		}
		for _, evidenceID := range response.Choice.SelectedArtifactEvidenceIDs {
			reference, exists := evidence[evidenceID]
			if !exists || reference.Kind != "artifact" {
				return fmt.Errorf("contracts: response references missing artifact %q", evidenceID)
			}
			selected := false
			for _, optionID := range response.Choice.OptionIDs {
				if options[optionID].ArtifactEvidenceID != nil && *options[optionID].ArtifactEvidenceID == evidenceID {
					selected = true
					break
				}
			}
			if !selected {
				return fmt.Errorf("contracts: artifact %q does not belong to a selected option", evidenceID)
			}
		}
		selectedArtifacts := map[string]struct{}{}
		for _, evidenceID := range response.Choice.SelectedArtifactEvidenceIDs {
			selectedArtifacts[evidenceID] = struct{}{}
		}
		if response.Choice.Outcome == "selected" || response.Choice.Outcome == "ranked" || response.Choice.Outcome == "qualified" {
			for _, optionID := range response.Choice.OptionIDs {
				artifactID := options[optionID].ArtifactEvidenceID
				if artifactID != nil {
					if _, exists := selectedArtifacts[*artifactID]; !exists {
						return fmt.Errorf("contracts: selected option %q is missing artifact %q", optionID, *artifactID)
					}
				}
			}
		}
	}
	for _, unresolved := range response.Unresolved {
		exists := false
		switch unresolved.SubjectKind {
		case "request":
			exists = unresolved.SubjectID == request.ID
		case "claim":
			_, exists = claims[unresolved.SubjectID]
		case "option":
			_, exists = options[unresolved.SubjectID]
		case "factor":
			_, exists = factors[unresolved.SubjectID]
		}
		if !exists {
			return fmt.Errorf("contracts: unresolved item references missing %s %q", unresolved.SubjectKind, unresolved.SubjectID)
		}
	}
	for _, annotation := range response.Annotations {
		reference, exists := evidence[annotation.ArtifactEvidenceID]
		if !exists || reference.Artifact == nil || reference.Artifact.SHA256 != annotation.ArtifactSHA256 {
			return fmt.Errorf("contracts: annotation %q does not match an admitted artifact", annotation.ID)
		}
	}
	return nil
}

func (evidence ResolvedEvidence) Validate() error {
	if !validID(evidence.EvidenceID) {
		return errors.New("contracts: resolved evidence id is invalid")
	}
	switch evidence.Status {
	case "resolved":
		if evidence.Content == nil || evidence.Error != nil {
			return errors.New("contracts: resolved evidence payload is invalid")
		}
		return evidence.Content.Validate()
	case "failed":
		if evidence.Content != nil || evidence.Error == nil {
			return errors.New("contracts: failed evidence payload is invalid")
		}
		return evidence.Error.Validate()
	default:
		return errors.New("contracts: resolved evidence status is unsupported")
	}
}

func (content ResolvedEvidenceContent) Validate() error {
	switch content.Kind {
	case "gitDiff":
		if content.UnifiedDiff == nil || content.Truncated == nil || content.Text != nil || content.StartLine != nil || content.EndLine != nil || content.JSON != nil || content.Route != nil || content.MediaType != nil || content.ByteLength != nil || content.SHA256 != nil {
			return errors.New("contracts: resolved Git diff content is invalid")
		}
		if err := validateResolvedText(*content.UnifiedDiff); err != nil {
			return err
		}
	case "text":
		if content.Text == nil || content.StartLine == nil || content.EndLine == nil || content.Truncated == nil || content.UnifiedDiff != nil || content.JSON != nil || content.Route != nil || content.MediaType != nil || content.ByteLength != nil || content.SHA256 != nil {
			return errors.New("contracts: resolved text content is invalid")
		}
		if err := validateResolvedText(*content.Text); err != nil {
			return err
		}
		if err := validateLineRange(*content.StartLine, *content.EndLine); err != nil {
			return err
		}
	case "json":
		if content.JSON == nil || content.UnifiedDiff != nil || content.Text != nil || content.StartLine != nil || content.EndLine != nil || content.Route != nil || content.MediaType != nil || content.ByteLength != nil || content.SHA256 != nil || content.Truncated != nil {
			return errors.New("contracts: resolved JSON content is invalid")
		}
		if err := validateRawJSON(content.JSON); err != nil {
			return err
		}
	case "artifact":
		if content.Route == nil || content.MediaType == nil || content.ByteLength == nil || content.SHA256 == nil || content.UnifiedDiff != nil || content.Text != nil || content.StartLine != nil || content.EndLine != nil || content.JSON != nil || content.Truncated != nil {
			return errors.New("contracts: resolved artifact content is invalid")
		}
		if !strings.HasPrefix(*content.Route, "/") || strings.ContainsRune(*content.Route, '\x00') || len(*content.Route) > maximumPathBytes || !mediaTypePattern.MatchString(*content.MediaType) || *content.ByteLength < 0 || !validSHA256(*content.SHA256) {
			return errors.New("contracts: resolved artifact metadata is invalid")
		}
	default:
		return errors.New("contracts: resolved evidence content kind is unsupported")
	}
	return nil
}

func (packet ContinuationPacket) Validate() error {
	if packet.Version != ContractVersion || !validID(packet.ProjectID) || !validSHA256(packet.RequestSHA256) {
		return errors.New("contracts: continuation identity is invalid")
	}
	if err := packet.Request.Validate(); err != nil {
		return err
	}
	if err := validateResponseForRequest(packet.Response, packet.Request, packet.RequestSHA256); err != nil {
		return err
	}
	evidence := map[string]struct{}{}
	for _, reference := range packet.Request.Evidence {
		evidence[reference.ID] = struct{}{}
	}
	for _, resolved := range packet.Evidence {
		if err := resolved.Validate(); err != nil {
			return err
		}
		if _, exists := evidence[resolved.EvidenceID]; !exists {
			return fmt.Errorf("contracts: continuation evidence %q is not in the request", resolved.EvidenceID)
		}
	}
	return nil
}

func (document ExportDocument) Validate() error {
	if document.Version != ContractVersion || !validID(document.ProjectID) {
		return errors.New("contracts: export identity is invalid")
	}
	if document.Responses == nil || len(document.Responses) > maximumRequests || document.Continuations == nil || len(document.Continuations) > maximumRequests {
		return errors.New("contracts: export collections are missing or exceed the limit")
	}
	for _, response := range document.Responses {
		if err := response.Validate(); err != nil {
			return err
		}
	}
	for _, continuation := range document.Continuations {
		if continuation.ProjectID != document.ProjectID {
			return errors.New("contracts: continuation project identity does not match export")
		}
		if err := continuation.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (result MutationResult) Validate() error {
	if result.Version != ContractVersion {
		return errors.New("contracts: mutation result version is unsupported")
	}
	return result.Snapshot.Validate()
}

func (result ExportResult) Validate() error {
	if result.Version != ContractVersion {
		return errors.New("contracts: export result version is unsupported")
	}
	return result.Export.Validate()
}

func (structuredError StructuredError) Validate() error {
	if !validID(structuredError.Code) {
		return errors.New("contracts: error code is invalid")
	}
	if err := validateRequiredText(structuredError.Message); err != nil {
		return fmt.Errorf("contracts: error message: %w", err)
	}
	for label, value := range map[string]*string{"field": structuredError.Field, "request id": structuredError.RequestID, "evidence id": structuredError.EvidenceID} {
		if value == nil {
			continue
		}
		if label == "field" {
			if err := validateRequiredText(*value); err != nil {
				return fmt.Errorf("contracts: error field: %w", err)
			}
		} else if !validID(*value) {
			return fmt.Errorf("contracts: error %s is invalid", label)
		}
	}
	return nil
}

func validateUniqueIDs(values []string, maximum int, label string) error {
	if len(values) > maximum {
		return fmt.Errorf("contracts: %s ids exceed the limit", label)
	}
	seen := map[string]struct{}{}
	for _, value := range values {
		if !validID(value) {
			return fmt.Errorf("contracts: %s id is invalid", label)
		}
		if _, exists := seen[value]; exists {
			return fmt.Errorf("contracts: %s %q is repeated", label, value)
		}
		seen[value] = struct{}{}
	}
	return nil
}

func validateRawJSON(raw json.RawMessage) error {
	if len(raw) == 0 || len(raw) > maximumResolvedBytes {
		return errors.New("contracts: JSON value is missing or exceeds the limit")
	}
	return validateUniqueJSON(raw)
}

func validateResolvedText(value string) error {
	if !utf8.ValidString(value) || len(value) > maximumResolvedBytes || strings.ContainsRune(value, '\x00') {
		return errors.New("contracts: resolved text is invalid or exceeds the limit")
	}
	return nil
}

func validateLineRange(startLine int, endLine int) error {
	if startLine < 1 || endLine < startLine || endLine-startLine+1 > maximumEvidenceLines {
		return errors.New("line range is invalid or exceeds the limit")
	}
	return nil
}

func validateRelativePath(value string, allowDot bool) error {
	if value == "." && allowDot {
		return nil
	}
	if value == "" || len(value) > maximumPathBytes || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') || strings.Contains(value, "\\") || strings.HasPrefix(value, "/") || path.Clean(value) != value || value == "." || value == ".." || strings.HasPrefix(value, "../") {
		return errors.New("must be a normalized relative path")
	}
	return nil
}

func validateRequiredText(value string) error {
	if strings.TrimSpace(value) == "" || value != strings.TrimSpace(value) {
		return errors.New("must be non-empty and have no surrounding whitespace")
	}
	return validateText(value)
}

func validateText(value string) error {
	if !utf8.ValidString(value) || len(value) > maximumTextBytes || strings.ContainsRune(value, '\x00') {
		return errors.New("is invalid or exceeds the limit")
	}
	return nil
}

func validID(value string) bool {
	return idPattern.MatchString(value)
}

func validSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && value == strings.ToLower(value)
}

func validJSONPointer(value string) bool {
	if value == "" {
		return true
	}
	if !strings.HasPrefix(value, "/") || !utf8.ValidString(value) || len(value) > maximumPathBytes {
		return false
	}
	for index := 0; index < len(value); index++ {
		if value[index] != '~' {
			continue
		}
		if index+1 >= len(value) || (value[index+1] != '0' && value[index+1] != '1') {
			return false
		}
		index++
	}
	return true
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
