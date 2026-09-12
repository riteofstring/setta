package evaluator

import (
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"

	"github.com/setta/bench/backend/internal/contracts"
)

type ArtifactOpener interface {
	OpenArtifact(string) (contracts.ArtifactReferenceV1, io.ReadCloser, error)
}

func Apply(configuration *contracts.EvaluatorV1, artifacts []contracts.ArtifactReferenceV1, opener ArtifactOpener) []contracts.FindingV1 {
	findings := make([]contracts.FindingV1, 0)
	if configuration == nil {
		return findings
	}
	byName := make(map[string]contracts.ArtifactReferenceV1, len(artifacts))
	for _, artifact := range artifacts {
		byName[artifact.Name] = artifact
	}
	for _, check := range configuration.Checks {
		artifact, exists := byName[check.ArtifactName]
		if !exists {
			findings = append(findings, contracts.FindingV1{CheckID: check.ID, CheckName: check.Name, Status: "failed", Message: fmt.Sprintf("Artifact %q was not produced.", check.ArtifactName)})
			continue
		}
		switch check.Kind {
		case "artifact_max_bytes":
			status := "passed"
			if artifact.ByteLength > *check.MaximumBytes {
				status = "failed"
			}
			findings = append(findings, contracts.FindingV1{CheckID: check.ID, CheckName: check.Name, Status: status, Message: fmt.Sprintf("%d bytes; limit %d bytes.", artifact.ByteLength, *check.MaximumBytes)})
		case "image_dimensions":
			findings = append(findings, imageDimensions(check, artifact, opener))
		}
	}
	return findings
}

func imageDimensions(check contracts.CheckV1, artifact contracts.ArtifactReferenceV1, opener ArtifactOpener) contracts.FindingV1 {
	finding := contracts.FindingV1{CheckID: check.ID, CheckName: check.Name, Status: "failed"}
	if opener == nil {
		finding.Message = "Artifact inspection is unavailable."
		return finding
	}
	_, reader, err := opener.OpenArtifact(artifact.ID)
	if err != nil {
		finding.Message = "Artifact could not be opened."
		return finding
	}
	defer reader.Close()
	configuration, _, err := image.DecodeConfig(reader)
	if err != nil {
		finding.Message = "Artifact is not a supported image."
		return finding
	}
	if configuration.Width == *check.Width && configuration.Height == *check.Height {
		finding.Status = "passed"
	}
	finding.Message = fmt.Sprintf("%d×%d pixels; expected %d×%d.", configuration.Width, configuration.Height, *check.Width, *check.Height)
	return finding
}
