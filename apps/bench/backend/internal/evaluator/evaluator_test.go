package evaluator

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"testing"

	"github.com/setta/bench/backend/internal/contracts"
)

type memoryArtifacts struct {
	content map[string][]byte
}

func (artifacts memoryArtifacts) OpenArtifact(id string) (contracts.ArtifactReferenceV1, io.ReadCloser, error) {
	return contracts.ArtifactReferenceV1{}, io.NopCloser(bytes.NewReader(artifacts.content[id])), nil
}

func TestApplyEvaluatesHostOwnedArtifactPolicies(t *testing.T) {
	t.Parallel()
	imageBuffer := &bytes.Buffer{}
	pixels := image.NewNRGBA(image.Rect(0, 0, 12, 8))
	pixels.SetNRGBA(0, 0, color.NRGBA{R: 255, A: 255})
	if err := png.Encode(imageBuffer, pixels); err != nil {
		t.Fatalf("png.Encode() = %v", err)
	}
	maximum := int64(20)
	width, height := 12, 8
	configuration := &contracts.EvaluatorV1{ID: "checks", Name: "Checks", Checks: []contracts.CheckV1{
		{ID: "bytes", Name: "Size", Kind: "artifact_max_bytes", ArtifactName: "thumbnail", MaximumBytes: &maximum},
		{ID: "dimensions", Name: "Dimensions", Kind: "image_dimensions", ArtifactName: "thumbnail", Width: &width, Height: &height},
		{ID: "missing", Name: "Missing", Kind: "artifact_max_bytes", ArtifactName: "report", MaximumBytes: &maximum},
	}}
	reference := contracts.ArtifactReferenceV1{ID: "artifact-one", Name: "thumbnail", MediaType: "image/png", ByteLength: int64(imageBuffer.Len()), SHA256: "0000000000000000000000000000000000000000000000000000000000000000"}
	findings := Apply(configuration, []contracts.ArtifactReferenceV1{reference}, memoryArtifacts{content: map[string][]byte{reference.ID: imageBuffer.Bytes()}})
	if len(findings) != 3 || findings[0].Status != "failed" || findings[1].Status != "passed" || findings[2].Status != "failed" {
		t.Fatalf("Apply() = %#v", findings)
	}
}
