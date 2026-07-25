package hostedmeasurement

import (
	"context"
	"errors"
	"os"
	"path/filepath"
)

type HostedClientCredentialCleaner struct {
	Fly   HostedFlyMachineExecutor
	State *StateStore
}

func (cleaner HostedClientCredentialCleaner) CleanupCredentials(
	ctx context.Context,
	authorization Authorization,
) error {
	if cleaner.Fly == nil || cleaner.State == nil {
		return errors.New("hosted credential cleanup requires Fly exec and durable state")
	}
	state := cleaner.State.Snapshot()
	if state.Bootstrap == nil {
		return nil
	}
	machine, hasMachine := resourceByKind(state, ResourceFlyMachine)
	runtime, hasRuntime := resourceByKind(state, ResourceSprite)
	if !hasMachine || !hasRuntime {
		return errors.New("hosted credential cleanup requires exact durable Machine and Sprite resources")
	}
	admin := HostedLifecycleAdmin{Fly: cleaner.Fly, MachineID: machine.ID, RuntimeName: runtime.Name}
	cleanupErr := cleaner.revokeCredentialFile(
		ctx,
		authorization,
		admin,
		filepath.Join(authorization.StateDirectory, clientCredentialFileName),
		state.Bootstrap.DeviceID,
	)
	cleanupErr = errors.Join(cleanupErr, cleaner.revokeCredentialFile(
		ctx,
		authorization,
		admin,
		filepath.Join(authorization.StateDirectory, replacementCredentialFileName),
		"",
	))
	return cleanupErr
}

func (cleaner HostedClientCredentialCleaner) revokeCredentialFile(
	ctx context.Context,
	authorization Authorization,
	admin HostedLifecycleAdmin,
	path string,
	wantDeviceID string,
) error {
	credential, found, err := loadLocalClientCredential(path)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	if wantDeviceID != "" && credential.DeviceID != wantDeviceID {
		return errors.New("hosted cleanup credential differs from durable bootstrap")
	}
	revokeErr := admin.RevokeDevice(ctx, authorization, credential.DeviceID)
	removeErr := removeLocalCredential(path, authorization.StateDirectory)
	return errors.Join(revokeErr, removeErr)
}

func removeLocalCredential(path string, stateDirectory string) error {
	if filepath.Dir(filepath.Clean(path)) != stateDirectory {
		return errors.New("hosted cleanup credential must be inside the private state directory")
	}
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		return errors.New("hosted cleanup credential path is not a private regular file")
	}
	if err := os.Remove(path); err != nil {
		return errors.New("remove hosted cleanup credential failed")
	}
	return syncPrivateDirectory(stateDirectory)
}
