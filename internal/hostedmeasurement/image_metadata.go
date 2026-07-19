package hostedmeasurement

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
)

const maximumImageMetadataBytes = 256 * 1024

type buildxImageMetadata struct {
	Digest     string `json:"containerimage.digest"`
	Descriptor struct {
		Digest string `json:"digest"`
	} `json:"containerimage.descriptor"`
}

func ResolvePublishedImageReference(metadataPath string, authorization Authorization) (string, error) {
	if metadataPath == "" || !filepath.IsAbs(metadataPath) {
		return "", errors.New("published image metadata path must be absolute")
	}
	if filepath.Clean(filepath.Dir(metadataPath)) != authorization.StateDirectory {
		return "", errors.New("published image metadata must share the private run directory")
	}
	data, err := readPrivateRegularFile(metadataPath, maximumImageMetadataBytes, "published image metadata")
	if err != nil {
		return "", err
	}
	var metadata buildxImageMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return "", errors.New("decode published image metadata failed")
	}
	if !flyDigestPattern.MatchString(metadata.Digest) || metadata.Descriptor.Digest != metadata.Digest {
		return "", errors.New("published image metadata did not attest one matching manifest digest")
	}
	reference := fmt.Sprintf("registry.fly.io/%s@%s", authorization.Manifest.FlyAppName, metadata.Digest)
	if !flyImagePattern.MatchString(reference) {
		return "", errors.New("published image metadata produced an invalid registry reference")
	}
	return reference, nil
}
