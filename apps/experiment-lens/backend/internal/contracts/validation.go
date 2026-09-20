package contracts

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"path"
	"regexp"
	"strings"
	"time"
)

const (
	maximumFields       = 128
	maximumObservations = 100000
	maximumArtifacts    = 100000
	maximumRelations    = 250000
	maximumSelectionIDs = 10000
	maximumNotes        = 1000
	maximumRanges       = 1000
)

var (
	identifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)
	rolePattern       = regexp.MustCompile(`^[a-z][a-z0-9.-]{0,63}$`)
	digestPattern     = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

func DecodeStrict(data []byte, target any) error {
	if len(data) == 0 {
		return errors.New("contract: document is empty")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("contract: decode: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("contract: document contains trailing content")
	}
	return nil
}

func (identity ProducerIdentity) Validate() error {
	if !oneOf(identity.Kind, "agent", "human", "application", "script") {
		return errors.New("producer kind is invalid")
	}
	if err := requiredText(identity.Name, 200, "producer name"); err != nil {
		return err
	}
	if identity.Kind == "agent" {
		if identity.Model == nil || identity.Harness == nil {
			return errors.New("agent producer requires model and harness")
		}
		if err := requiredText(*identity.Model, 200, "producer model"); err != nil {
			return err
		}
		return requiredText(*identity.Harness, 200, "producer harness")
	}
	if identity.Model != nil || identity.Harness != nil {
		return errors.New("only an agent producer may declare model and harness")
	}
	return nil
}

func (provenance Provenance) Validate() error {
	if err := provenance.Producer.Validate(); err != nil {
		return err
	}
	parsed, err := time.Parse(time.RFC3339, provenance.CreatedAt)
	if err != nil || parsed.Format(time.RFC3339) != provenance.CreatedAt {
		return errors.New("createdAt must be a canonical RFC3339 timestamp")
	}
	return nil
}

func (manifest ExperimentManifest) Validate() error {
	if manifest.Version != ContractVersion {
		return fmt.Errorf("unsupported manifest version %d", manifest.Version)
	}
	if err := identifier(manifest.ID, "experiment id"); err != nil {
		return err
	}
	if err := requiredText(manifest.Title, 300, "experiment title"); err != nil {
		return err
	}
	if err := requiredText(manifest.Summary, 4000, "experiment summary"); err != nil {
		return err
	}
	if len(manifest.Fields) == 0 || len(manifest.Fields) > maximumFields {
		return errors.New("experiment fields must contain between 1 and 128 entries")
	}
	if manifest.Artifacts == nil || len(manifest.Artifacts) > maximumArtifacts {
		return errors.New("experiment artifacts are invalid")
	}
	if manifest.Relations == nil || len(manifest.Relations) > maximumRelations {
		return errors.New("experiment relations are invalid")
	}
	fieldIDs := map[string]struct{}{}
	timestamps := 0
	for _, field := range manifest.Fields {
		if err := field.Validate(); err != nil {
			return fmt.Errorf("field %q: %w", field.ID, err)
		}
		if _, exists := fieldIDs[field.ID]; exists {
			return fmt.Errorf("field %q is repeated", field.ID)
		}
		fieldIDs[field.ID] = struct{}{}
		if field.Role == "timestamp" {
			timestamps++
		}
	}
	if timestamps > 1 {
		return errors.New("at most one timestamp field is allowed")
	}
	if err := manifest.Observations.Validate(); err != nil {
		return fmt.Errorf("observation source: %w", err)
	}
	artifactIDs := map[string]struct{}{}
	paths := map[string]struct{}{manifest.Observations.Path: {}}
	for _, artifact := range manifest.Artifacts {
		if err := artifact.Validate(); err != nil {
			return fmt.Errorf("artifact %q: %w", artifact.ID, err)
		}
		if _, exists := artifactIDs[artifact.ID]; exists {
			return fmt.Errorf("artifact %q is repeated", artifact.ID)
		}
		if _, exists := paths[artifact.Path]; exists {
			return fmt.Errorf("input path %q is repeated", artifact.Path)
		}
		artifactIDs[artifact.ID] = struct{}{}
		paths[artifact.Path] = struct{}{}
	}
	for _, relation := range manifest.Relations {
		if err := relation.Validate(); err != nil {
			return err
		}
		if _, exists := artifactIDs[relation.ArtifactID]; !exists {
			return fmt.Errorf("relation references unknown artifact %q", relation.ArtifactID)
		}
	}
	if err := manifest.Presentation.Validate(manifest.Fields, manifest.Artifacts, manifest.Relations); err != nil {
		return fmt.Errorf("presentation: %w", err)
	}
	return manifest.Provenance.Validate()
}

func (field FieldDefinition) Validate() error {
	if err := identifier(field.ID, "field id"); err != nil {
		return err
	}
	if err := requiredText(field.Label, 200, "field label"); err != nil {
		return err
	}
	if err := boundedText(field.Description, 2000, "field description"); err != nil {
		return err
	}
	if !oneOf(field.Role, "factor", "metric", "timestamp") {
		return errors.New("field role is invalid")
	}
	if !oneOf(field.ValueType, "number", "string", "boolean", "timestamp") {
		return errors.New("field value type is invalid")
	}
	if (field.Role == "timestamp") != (field.ValueType == "timestamp") {
		return errors.New("timestamp role and value type must be used together")
	}
	if field.Unit != nil {
		if err := requiredText(*field.Unit, 40, "field unit"); err != nil {
			return err
		}
	}
	return nil
}

func (reference ObservationReference) Validate() error {
	if err := relativePath(reference.Path); err != nil {
		return err
	}
	if reference.ByteLength < 2 || reference.ByteLength > 64<<20 {
		return errors.New("observation source byte length is invalid")
	}
	return digest(reference.SHA256, "observation source digest")
}

func (reference ArtifactReference) Validate() error {
	if err := identifier(reference.ID, "artifact id"); err != nil {
		return err
	}
	if err := requiredText(reference.Label, 300, "artifact label"); err != nil {
		return err
	}
	if err := relativePath(reference.Path); err != nil {
		return err
	}
	if reference.ByteLength < 0 || reference.ByteLength > 512<<20 {
		return errors.New("artifact byte length is invalid")
	}
	if err := digest(reference.SHA256, "artifact digest"); err != nil {
		return err
	}
	parsed, _, err := mime.ParseMediaType(reference.MediaType)
	if err != nil || parsed != reference.MediaType || len(reference.MediaType) > 120 {
		return errors.New("artifact media type is invalid")
	}
	return nil
}

func (relation ArtifactRelation) Validate() error {
	if err := identifier(relation.ObservationID, "relation observation id"); err != nil {
		return err
	}
	if err := identifier(relation.ArtifactID, "relation artifact id"); err != nil {
		return err
	}
	if !rolePattern.MatchString(relation.Role) {
		return errors.New("relation role is invalid")
	}
	if relation.Timeline != nil {
		if err := identifier(relation.Timeline.AxisID, "relation timeline axis id"); err != nil {
			return err
		}
		if !finite(relation.Timeline.Value) {
			return errors.New("relation timeline value must be finite")
		}
	}
	return nil
}

func (source ObservationSource) Validate() error {
	if source.Version != ContractVersion {
		return fmt.Errorf("unsupported observation source version %d", source.Version)
	}
	if err := identifier(source.ExperimentID, "observation source experiment id"); err != nil {
		return err
	}
	if len(source.Observations) == 0 || len(source.Observations) > maximumObservations {
		return errors.New("observation source must contain between 1 and 100000 observations")
	}
	ids := map[string]struct{}{}
	for _, observation := range source.Observations {
		if err := observation.Validate(); err != nil {
			return fmt.Errorf("observation %q: %w", observation.ID, err)
		}
		if _, exists := ids[observation.ID]; exists {
			return fmt.Errorf("observation %q is repeated", observation.ID)
		}
		ids[observation.ID] = struct{}{}
	}
	return nil
}

func (source ObservationSource) ValidateAgainst(manifest ExperimentManifest) error {
	if err := source.Validate(); err != nil {
		return err
	}
	if source.ExperimentID != manifest.ID {
		return errors.New("observation source targets another experiment")
	}
	fields := map[string]FieldDefinition{}
	for _, field := range manifest.Fields {
		fields[field.ID] = field
	}
	observationIDs := map[string]struct{}{}
	for _, observation := range source.Observations {
		observationIDs[observation.ID] = struct{}{}
		if len(observation.Values) != len(fields) {
			return fmt.Errorf("observation %q does not contain every declared field", observation.ID)
		}
		for fieldID, field := range fields {
			value, exists := observation.Values[fieldID]
			if !exists {
				return fmt.Errorf("observation %q is missing field %q", observation.ID, fieldID)
			}
			if err := validateScalar(value, field); err != nil {
				return fmt.Errorf("observation %q field %q: %w", observation.ID, fieldID, err)
			}
		}
	}
	seenRelations := map[string]struct{}{}
	for _, relation := range manifest.Relations {
		if _, exists := observationIDs[relation.ObservationID]; !exists {
			return fmt.Errorf("relation references unknown observation %q", relation.ObservationID)
		}
		key := relation.ObservationID + "\x00" + relation.ArtifactID + "\x00" + relation.Role
		if _, exists := seenRelations[key]; exists {
			return errors.New("artifact relation is repeated")
		}
		seenRelations[key] = struct{}{}
	}
	return nil
}

func (observation Observation) Validate() error {
	if err := identifier(observation.ID, "observation id"); err != nil {
		return err
	}
	if observation.Values == nil || len(observation.Values) > maximumFields {
		return errors.New("observation values are invalid")
	}
	for key, value := range observation.Values {
		if err := identifier(key, "observation field id"); err != nil {
			return err
		}
		if _, err := scalar(value); err != nil {
			return err
		}
	}
	return nil
}

func EmptySelection() LensSelection {
	return LensSelection{
		Filters:                []FieldFilter{},
		SelectedObservationIDs: []string{},
		SelectedArtifactIDs:    []string{},
		Ranges:                 []ArtifactRange{},
		Notes:                  []SelectionNote{},
	}
}

func (selection LensSelection) Validate() error {
	if selection.Filters == nil || selection.SelectedObservationIDs == nil || selection.SelectedArtifactIDs == nil || selection.Ranges == nil || selection.Notes == nil {
		return errors.New("selection collections are required")
	}
	if len(selection.Filters) > maximumFields || len(selection.SelectedObservationIDs) > maximumSelectionIDs || len(selection.SelectedArtifactIDs) > maximumSelectionIDs || len(selection.Ranges) > maximumRanges || len(selection.Notes) > maximumNotes {
		return errors.New("selection exceeds a size limit")
	}
	filterFields := map[string]struct{}{}
	for _, filter := range selection.Filters {
		if err := filter.Validate(); err != nil {
			return err
		}
		if _, exists := filterFields[filter.FieldID]; exists {
			return fmt.Errorf("field filter %q is repeated", filter.FieldID)
		}
		filterFields[filter.FieldID] = struct{}{}
	}
	if selection.FocusedObservationID != nil {
		if err := identifier(*selection.FocusedObservationID, "focused observation id"); err != nil {
			return err
		}
	}
	if err := uniqueIdentifiers(selection.SelectedObservationIDs, "selected observation"); err != nil {
		return err
	}
	if err := uniqueIdentifiers(selection.SelectedArtifactIDs, "selected artifact"); err != nil {
		return err
	}
	rangeIDs := map[string]struct{}{}
	for _, selectedRange := range selection.Ranges {
		if err := selectedRange.Validate(); err != nil {
			return err
		}
		if _, exists := rangeIDs[selectedRange.ID]; exists {
			return fmt.Errorf("range %q is repeated", selectedRange.ID)
		}
		rangeIDs[selectedRange.ID] = struct{}{}
	}
	noteIDs := map[string]struct{}{}
	for _, note := range selection.Notes {
		if err := note.Validate(); err != nil {
			return err
		}
		if _, exists := noteIDs[note.ID]; exists {
			return fmt.Errorf("note %q is repeated", note.ID)
		}
		if note.RangeID != nil {
			if _, exists := rangeIDs[*note.RangeID]; !exists {
				return fmt.Errorf("note %q references unknown range %q", note.ID, *note.RangeID)
			}
		}
		noteIDs[note.ID] = struct{}{}
	}
	return nil
}

func (selection LensSelection) ValidateAgainst(manifest ExperimentManifest, source ObservationSource) error {
	if err := selection.Validate(); err != nil {
		return err
	}
	fields := map[string]FieldDefinition{}
	for _, field := range manifest.Fields {
		fields[field.ID] = field
	}
	observations := map[string]struct{}{}
	for _, observation := range source.Observations {
		observations[observation.ID] = struct{}{}
	}
	artifacts := map[string]ArtifactReference{}
	for _, artifact := range manifest.Artifacts {
		artifacts[artifact.ID] = artifact
	}
	for _, filter := range selection.Filters {
		field, exists := fields[filter.FieldID]
		if !exists {
			return fmt.Errorf("selection references unknown field %q", filter.FieldID)
		}
		if err := filter.ValidateAgainst(field); err != nil {
			return err
		}
	}
	if selection.FocusedObservationID != nil {
		if _, exists := observations[*selection.FocusedObservationID]; !exists {
			return fmt.Errorf("selection references unknown observation %q", *selection.FocusedObservationID)
		}
	}
	for _, id := range selection.SelectedObservationIDs {
		if _, exists := observations[id]; !exists {
			return fmt.Errorf("selection references unknown observation %q", id)
		}
	}
	for _, id := range selection.SelectedArtifactIDs {
		if _, exists := artifacts[id]; !exists {
			return fmt.Errorf("selection references unknown artifact %q", id)
		}
	}
	for _, selectedRange := range selection.Ranges {
		artifact, exists := artifacts[selectedRange.ArtifactID]
		if !exists {
			return fmt.Errorf("range %q references unknown artifact %q", selectedRange.ID, selectedRange.ArtifactID)
		}
		if artifact.SHA256 != selectedRange.ArtifactSHA256 {
			return fmt.Errorf("range %q artifact identity does not match", selectedRange.ID)
		}
	}
	for _, note := range selection.Notes {
		if note.ObservationID != nil {
			if _, exists := observations[*note.ObservationID]; !exists {
				return fmt.Errorf("note %q references unknown observation %q", note.ID, *note.ObservationID)
			}
		}
		if note.ArtifactID != nil {
			artifact, exists := artifacts[*note.ArtifactID]
			if !exists || note.ArtifactSHA256 == nil || artifact.SHA256 != *note.ArtifactSHA256 {
				return fmt.Errorf("note %q artifact identity does not match", note.ID)
			}
		}
	}
	return nil
}

func (filter FieldFilter) Validate() error {
	if err := identifier(filter.FieldID, "filter field id"); err != nil {
		return err
	}
	if !oneOf(filter.Operator, "in", "range") {
		return errors.New("filter operator is invalid")
	}
	if filter.Values == nil {
		return errors.New("filter values are required")
	}
	if filter.Operator == "in" {
		if len(filter.Values) == 0 || len(filter.Values) > 1000 || filter.Minimum != nil || filter.Maximum != nil {
			return errors.New("in filter shape is invalid")
		}
		for _, value := range filter.Values {
			if _, err := scalar(value); err != nil {
				return err
			}
		}
		return nil
	}
	if len(filter.Values) != 0 || filter.Minimum == nil && filter.Maximum == nil {
		return errors.New("range filter shape is invalid")
	}
	if filter.Minimum != nil && !finite(*filter.Minimum) || filter.Maximum != nil && !finite(*filter.Maximum) {
		return errors.New("range filter bounds must be finite")
	}
	if filter.Minimum != nil && filter.Maximum != nil && *filter.Minimum > *filter.Maximum {
		return errors.New("range filter minimum exceeds maximum")
	}
	return nil
}

func (filter FieldFilter) ValidateAgainst(field FieldDefinition) error {
	if filter.Operator == "range" {
		if field.ValueType != "number" && field.ValueType != "timestamp" {
			return fmt.Errorf("field %q does not support range filters", field.ID)
		}
		if field.ValueType == "timestamp" {
			return fmt.Errorf("field %q requires discrete timestamp filters in version 1", field.ID)
		}
		return nil
	}
	for _, value := range filter.Values {
		if err := validateScalar(value, field); err != nil {
			return fmt.Errorf("filter field %q: %w", field.ID, err)
		}
	}
	return nil
}

func (selectedRange ArtifactRange) Validate() error {
	if err := identifier(selectedRange.ID, "range id"); err != nil {
		return err
	}
	if err := identifier(selectedRange.ArtifactID, "range artifact id"); err != nil {
		return err
	}
	if err := digest(selectedRange.ArtifactSHA256, "range artifact digest"); err != nil {
		return err
	}
	if err := identifier(selectedRange.AxisID, "range axis id"); err != nil {
		return err
	}
	if !finite(selectedRange.Start) || !finite(selectedRange.End) || selectedRange.Start > selectedRange.End {
		return errors.New("artifact range bounds are invalid")
	}
	return nil
}

func (note SelectionNote) Validate() error {
	if err := identifier(note.ID, "note id"); err != nil {
		return err
	}
	if err := requiredText(note.Text, 8000, "note text"); err != nil {
		return err
	}
	anchors := 0
	if note.ObservationID != nil {
		anchors++
		if err := identifier(*note.ObservationID, "note observation id"); err != nil {
			return err
		}
	}
	if note.ArtifactID != nil {
		anchors++
		if note.ArtifactSHA256 == nil {
			return errors.New("artifact note requires an artifact digest")
		}
		if err := identifier(*note.ArtifactID, "note artifact id"); err != nil {
			return err
		}
		if err := digest(*note.ArtifactSHA256, "note artifact digest"); err != nil {
			return err
		}
	} else if note.ArtifactSHA256 != nil {
		return errors.New("note artifact digest requires an artifact id")
	}
	if note.RangeID != nil {
		anchors++
		if err := identifier(*note.RangeID, "note range id"); err != nil {
			return err
		}
	}
	if anchors == 0 {
		return errors.New("note requires an observation, artifact, or range anchor")
	}
	return nil
}

func (mutation LensMutation) Validate() error {
	if err := identifier(mutation.ExperimentID, "mutation experiment id"); err != nil {
		return err
	}
	if err := digest(mutation.ManifestSHA256, "mutation manifest digest"); err != nil {
		return err
	}
	if err := digest(mutation.ObservationSourceSHA256, "mutation observation source digest"); err != nil {
		return err
	}
	return mutation.Selection.Validate()
}

func (series SeriesDocument) Validate() error {
	if series.SchemaVersion != "setta-series/v1" {
		return errors.New("series schema version is invalid")
	}
	if err := series.Axis.Validate(); err != nil {
		return err
	}
	if len(series.Series) == 0 || len(series.Series) > 64 || len(series.Samples) == 0 || len(series.Samples) > 100000 {
		return errors.New("series dimensions are invalid")
	}
	definitions := map[string]struct{}{}
	for _, definition := range series.Series {
		if err := definition.Validate(); err != nil {
			return err
		}
		if _, exists := definitions[definition.ID]; exists {
			return fmt.Errorf("series %q is repeated", definition.ID)
		}
		definitions[definition.ID] = struct{}{}
	}
	last := math.Inf(-1)
	for _, sample := range series.Samples {
		if !finite(sample.X) || sample.X < last || len(sample.Values) != len(definitions) {
			return errors.New("series sample axis or values are invalid")
		}
		last = sample.X
		for id := range definitions {
			value, exists := sample.Values[id]
			if !exists || value != nil && !finite(*value) {
				return fmt.Errorf("series sample value %q is invalid", id)
			}
		}
	}
	return nil
}

func (axis SeriesAxis) Validate() error {
	if err := identifier(axis.ID, "series axis id"); err != nil {
		return err
	}
	if err := requiredText(axis.Label, 200, "series axis label"); err != nil {
		return err
	}
	if axis.Unit != nil {
		return requiredText(*axis.Unit, 40, "series axis unit")
	}
	return nil
}

func (definition SeriesDefinition) Validate() error {
	if err := identifier(definition.ID, "series id"); err != nil {
		return err
	}
	if err := requiredText(definition.Label, 200, "series label"); err != nil {
		return err
	}
	if definition.Unit != nil {
		return requiredText(*definition.Unit, 40, "series unit")
	}
	return nil
}

func (snapshot LensSnapshot) Validate() error {
	if snapshot.Version != ContractVersion || snapshot.ManifestPath != "experiment.json" {
		return errors.New("snapshot identity is invalid")
	}
	if err := digest(snapshot.ManifestSHA256, "snapshot manifest digest"); err != nil {
		return err
	}
	if snapshot.ObservationSourcePath != snapshot.Experiment.Observations.Path || snapshot.ObservationSourceSHA256 != snapshot.Experiment.Observations.SHA256 {
		return errors.New("snapshot observation source identity does not match")
	}
	if err := snapshot.Experiment.Validate(); err != nil {
		return err
	}
	source := ObservationSource{Version: ContractVersion, ExperimentID: snapshot.Experiment.ID, Observations: snapshot.Observations}
	if err := source.ValidateAgainst(snapshot.Experiment); err != nil {
		return err
	}
	if len(snapshot.Artifacts) != len(snapshot.Experiment.Artifacts) {
		return errors.New("snapshot artifact collection does not match")
	}
	for index, artifact := range snapshot.Artifacts {
		if artifact.Reference.ID != snapshot.Experiment.Artifacts[index].ID {
			return errors.New("snapshot artifact order does not match")
		}
		if !oneOf(artifact.Status, "resolved", "failed") || artifact.Status == "resolved" && (artifact.Content == nil || artifact.Error != nil) || artifact.Status == "failed" && (artifact.Content != nil || artifact.Error == nil) {
			return errors.New("snapshot artifact resolution is invalid")
		}
	}
	return snapshot.Selection.ValidateAgainst(snapshot.Experiment, source)
}

func (packet SelectionPacket) Validate() error {
	if packet.Version != ContractVersion || packet.ID != fmt.Sprintf("%s-r%d", packet.Experiment.ID, packet.Revision) {
		return errors.New("selection packet identity is invalid")
	}
	if err := identifier(packet.Experiment.ID, "packet experiment id"); err != nil {
		return err
	}
	if err := requiredText(packet.Experiment.Title, 300, "packet experiment title"); err != nil {
		return err
	}
	if err := requiredText(packet.Experiment.Summary, 4000, "packet experiment summary"); err != nil {
		return err
	}
	if packet.Source.ManifestPath != "experiment.json" {
		return errors.New("packet manifest path is invalid")
	}
	if err := digest(packet.Source.ManifestSHA256, "packet manifest digest"); err != nil {
		return err
	}
	if err := relativePath(packet.Source.ObservationSourcePath); err != nil {
		return err
	}
	if err := digest(packet.Source.ObservationSourceSHA256, "packet observation digest"); err != nil {
		return err
	}
	if err := packet.Selection.Validate(); err != nil {
		return err
	}
	for _, observation := range packet.Observations {
		if err := observation.Validate(); err != nil {
			return err
		}
	}
	for _, artifact := range packet.Artifacts {
		if err := artifact.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func (result MutationResult) Validate() error {
	if result.Version != ContractVersion {
		return errors.New("mutation result version is invalid")
	}
	return result.Snapshot.Validate()
}

func (result ExportResult) Validate() error {
	if result.Version != ContractVersion {
		return errors.New("export result version is invalid")
	}
	return result.Packet.Validate()
}

func validateScalar(raw json.RawMessage, field FieldDefinition) error {
	value, err := scalar(raw)
	if err != nil {
		return err
	}
	if value == nil {
		if field.Nullable {
			return nil
		}
		return errors.New("null is not allowed")
	}
	switch field.ValueType {
	case "number":
		if _, ok := value.(float64); !ok {
			return errors.New("value must be a number")
		}
	case "string":
		if text, ok := value.(string); !ok || len(text) > 4000 {
			return errors.New("value must be a bounded string")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return errors.New("value must be a boolean")
		}
	case "timestamp":
		text, ok := value.(string)
		parsed, parseErr := time.Parse(time.RFC3339, text)
		if !ok || parseErr != nil || parsed.Format(time.RFC3339) != text {
			return errors.New("value must be a canonical RFC3339 timestamp")
		}
	}
	return nil
}

func scalar(raw json.RawMessage) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, errors.New("value is not valid JSON")
	}
	switch typed := value.(type) {
	case nil, bool, string:
		return typed, nil
	case float64:
		if !finite(typed) {
			return nil, errors.New("number must be finite")
		}
		return typed, nil
	default:
		return nil, errors.New("value must be a JSON scalar")
	}
}

func uniqueIdentifiers(values []string, label string) error {
	seen := map[string]struct{}{}
	for _, value := range values {
		if err := identifier(value, label+" id"); err != nil {
			return err
		}
		if _, exists := seen[value]; exists {
			return fmt.Errorf("%s %q is repeated", label, value)
		}
		seen[value] = struct{}{}
	}
	return nil
}

func identifier(value string, label string) error {
	if !identifierPattern.MatchString(value) {
		return fmt.Errorf("%s is invalid", label)
	}
	return nil
}

func digest(value string, label string) error {
	if !digestPattern.MatchString(value) {
		return fmt.Errorf("%s is invalid", label)
	}
	return nil
}

func relativePath(value string) error {
	if value == "" || strings.Contains(value, "\\") || strings.ContainsRune(value, '\x00') || strings.HasPrefix(value, "/") || path.Clean(value) != value || value == "." || value == ".." || strings.HasPrefix(value, "../") {
		return errors.New("path must be a normalized project-relative path")
	}
	return nil
}

func requiredText(value string, maximum int, label string) error {
	if value == "" || value != strings.TrimSpace(value) || len(value) > maximum || strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("%s is invalid", label)
	}
	return nil
}

func boundedText(value string, maximum int, label string) error {
	if value != strings.TrimSpace(value) || len(value) > maximum || strings.ContainsRune(value, '\x00') {
		return fmt.Errorf("%s is invalid", label)
	}
	return nil
}

func finite(value float64) bool {
	return !math.IsInf(value, 0) && !math.IsNaN(value)
}

func oneOf(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if candidate == value {
			return true
		}
	}
	return false
}
