package contracts

import (
	"errors"
	"fmt"
)

func (snapshot LensSnapshot) Validate() error {
	if err := snapshot.validateIdentity(); err != nil {
		return err
	}
	if err := snapshot.Experiment.Validate(); err != nil {
		return err
	}
	source := ObservationSource{Version: ContractVersion, ExperimentID: snapshot.Experiment.ID, Observations: snapshot.Observations}
	if err := source.ValidateAgainst(snapshot.Experiment); err != nil {
		return err
	}
	if err := validateResolvedArtifacts(snapshot.Artifacts, snapshot.Experiment.Artifacts); err != nil {
		return err
	}
	return snapshot.Selection.ValidateAgainst(snapshot.Experiment, source)
}

func (snapshot LensSnapshot) validateIdentity() error {
	if snapshot.Version != ContractVersion || snapshot.ManifestPath != "experiment.json" {
		return errors.New("snapshot identity is invalid")
	}
	if err := digest(snapshot.ManifestSHA256, "snapshot manifest digest"); err != nil {
		return err
	}
	if snapshot.ObservationSourcePath != snapshot.Experiment.Observations.Path || snapshot.ObservationSourceSHA256 != snapshot.Experiment.Observations.SHA256 {
		return errors.New("snapshot observation source identity does not match")
	}
	return nil
}

func validateResolvedArtifacts(resolved []ResolvedArtifact, references []ArtifactReference) error {
	if len(resolved) != len(references) {
		return errors.New("snapshot artifact collection does not match")
	}
	for index, artifact := range resolved {
		if artifact.Reference.ID != references[index].ID {
			return errors.New("snapshot artifact order does not match")
		}
		if !resolvedArtifactShapeIsValid(artifact) {
			return errors.New("snapshot artifact resolution is invalid")
		}
	}
	return nil
}

func resolvedArtifactShapeIsValid(artifact ResolvedArtifact) bool {
	if artifact.Status == "resolved" {
		return artifact.Content != nil && artifact.Error == nil
	}
	if artifact.Status == "failed" {
		return artifact.Content == nil && artifact.Error != nil
	}
	return false
}

func (packet SelectionPacket) Validate() error {
	if err := packet.validateIdentity(); err != nil {
		return err
	}
	if err := packet.Source.Validate(); err != nil {
		return err
	}
	if err := packet.Selection.Validate(); err != nil {
		return err
	}
	if err := validatePacketObservations(packet.Observations); err != nil {
		return err
	}
	return validatePacketArtifacts(packet.Artifacts)
}

func (packet SelectionPacket) validateIdentity() error {
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
	return nil
}

func (source SourceIdentity) Validate() error {
	if source.ManifestPath != "experiment.json" {
		return errors.New("packet manifest path is invalid")
	}
	if err := digest(source.ManifestSHA256, "packet manifest digest"); err != nil {
		return err
	}
	if err := relativePath(source.ObservationSourcePath); err != nil {
		return err
	}
	return digest(source.ObservationSourceSHA256, "packet observation digest")
}

func validatePacketObservations(observations []Observation) error {
	for _, observation := range observations {
		if err := observation.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func validatePacketArtifacts(artifacts []ArtifactReference) error {
	for _, artifact := range artifacts {
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
