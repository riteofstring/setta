package httpapi

const RuntimeFeatureSetVersion = 1

const (
	RuntimeFeatureDevicePairingURL = "device_pairing_url"
	RuntimeFeatureRuntimeWebApp    = "runtime_web_app"
	RuntimeFeatureWebPush          = "web_push"
)

var runtimeFeatures = [...]string{
	RuntimeFeatureDevicePairingURL,
	RuntimeFeatureRuntimeWebApp,
	RuntimeFeatureWebPush,
}

func RuntimeFeatureSetIdentity() RuntimeFeatureSet {
	features := make([]string, len(runtimeFeatures))
	copy(features, runtimeFeatures[:])
	return RuntimeFeatureSet{
		Version:  RuntimeFeatureSetVersion,
		Features: features,
	}
}
