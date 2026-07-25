// Package runtimecapability defines Setta runtime feature identity reported by
// the trusted runtime.
package runtimecapability

import (
	"fmt"
	"slices"
)

const RuntimeFeatureSetVersion = 1

const (
	RuntimeFeatureDevicePairingURL = "device_pairing_url"
	RuntimeFeatureRuntimeWebApp    = "runtime_web_app"
	RuntimeFeatureSetupAttestation = "setup_attestation"
	RuntimeFeatureWebPush          = "web_push"
)

var runtimeFeatures = [...]string{
	RuntimeFeatureDevicePairingURL,
	RuntimeFeatureRuntimeWebApp,
	RuntimeFeatureSetupAttestation,
	RuntimeFeatureWebPush,
}

type RuntimeFeatureSet struct {
	Version  int      `json:"version"`
	Features []string `json:"features"`
}

func RuntimeFeatureSetIdentity() RuntimeFeatureSet {
	features := make([]string, len(runtimeFeatures))
	copy(features, runtimeFeatures[:])
	return RuntimeFeatureSet{
		Version:  RuntimeFeatureSetVersion,
		Features: features,
	}
}

func ValidateRuntimeFeatureSet(featureSet RuntimeFeatureSet) error {
	if featureSet.Version != RuntimeFeatureSetVersion {
		return fmt.Errorf("runtime feature set version = %d, want %d", featureSet.Version, RuntimeFeatureSetVersion)
	}
	if !slices.Equal(featureSet.Features, runtimeFeatures[:]) {
		return fmt.Errorf("runtime feature set features = %v, want %v", featureSet.Features, runtimeFeatures)
	}
	return nil
}

func EqualRuntimeFeatureSet(left RuntimeFeatureSet, right RuntimeFeatureSet) bool {
	return left.Version == right.Version && slices.Equal(left.Features, right.Features)
}
