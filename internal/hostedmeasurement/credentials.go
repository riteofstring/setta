package hostedmeasurement

import (
	"errors"
	"path/filepath"
)

func ReadPrivateCredentialFile(path string, authorization Authorization) ([]byte, error) {
	if path == "" || !filepath.IsAbs(path) {
		return nil, errors.New("hosted measurement credential path must be absolute")
	}
	if filepath.Clean(filepath.Dir(path)) != authorization.StateDirectory {
		return nil, errors.New("hosted measurement credentials must be stored in the private run directory")
	}
	credential, err := readPrivateRegularFile(path, maximumFlyTokenBytes, "hosted measurement credential")
	if err != nil {
		return nil, err
	}
	if !validFlyToken(credential) {
		return nil, errors.New("hosted measurement credential must be non-empty visible ASCII")
	}
	return credential, nil
}

func SpriteNameFromState(state State) (string, bool) {
	if resource, ok := resourceByKind(state, ResourceSprite); ok {
		return resource.Name, true
	}
	if intent, ok := intentByKind(state, ResourceSprite); ok {
		return intent.Name, true
	}
	return "", false
}

func StateRequiresFlyCleanup(state State) bool {
	return stateHasAnyKind(state, ResourceFlyApp, ResourceFlyVolume, ResourceFlyMachine)
}

func StateRequiresSpriteCleanup(state State) bool {
	return stateHasAnyKind(state, ResourceSprite)
}
