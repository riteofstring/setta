package llmconfig

import (
	"errors"
	"fmt"

	"setta/internal/statefs"
)

var ErrInvalidConfig = errors.New("invalid llm config")

type ServiceOptions struct {
	ConfigPath         string
	ManagedAPIKeysPath string
	Runtime            *Runtime
	ProcessEnv         func() map[string]string
}

type Service struct {
	configPath         string
	managedAPIKeysPath string
	runtime            *Runtime
	processEnv         func() map[string]string
}

func NewService(opts ServiceOptions) (*Service, error) {
	if opts.Runtime == nil {
		return nil, fmt.Errorf("llm config runtime is required")
	}
	configPath, err := statefs.NormalizePath(opts.ConfigPath, "")
	if err != nil {
		return nil, fmt.Errorf("resolve llm config path: %w", err)
	}
	managedAPIKeysPath, err := statefs.NormalizePath(opts.ManagedAPIKeysPath, "")
	if err != nil {
		return nil, fmt.Errorf("resolve managed api keys path: %w", err)
	}
	processEnv := opts.ProcessEnv
	if processEnv == nil {
		processEnv = CurrentProcessEnv
	}
	return &Service{
		configPath:         configPath,
		managedAPIKeysPath: managedAPIKeysPath,
		runtime:            opts.Runtime,
		processEnv:         processEnv,
	}, nil
}

func (s *Service) Configs() AllConfigs {
	if s == nil || s.runtime == nil {
		return AllConfigs{}
	}
	return s.runtime.Configs()
}

func (s *Service) SaveConfig(configs AllConfigs) (AllConfigs, ManagedAPIKeysSnapshot, error) {
	if s == nil || s.runtime == nil {
		return AllConfigs{}, ManagedAPIKeysSnapshot{}, fmt.Errorf("llm config service is required")
	}

	normalized, err := configs.normalized()
	if err != nil {
		return AllConfigs{}, ManagedAPIKeysSnapshot{}, fmt.Errorf("%w: %v", ErrInvalidConfig, err)
	}
	if err := Save(s.configPath, normalized); err != nil {
		return AllConfigs{}, ManagedAPIKeysSnapshot{}, err
	}

	snapshot := s.applyConfigAndSyncManagedAPIKeys(normalized)
	return s.runtime.Configs(), snapshot, nil
}

func (s *Service) ManagedAPIKeysSnapshot() ManagedAPIKeysSnapshot {
	if s == nil {
		return BuildManagedAPIKeysSnapshot(
			managedAPIKeysUnavailableResult(fmt.Errorf("llm config service is required")),
			map[string]string{},
		)
	}
	return s.buildManagedAPIKeysSnapshot(s.Configs(), ReadManagedAPIKeysWithStatus(s.managedAPIKeysPath))
}

func (s *Service) SaveManagedAPIKeys(payload map[string]string, expectedRevision int) (ManagedAPIKeysSnapshot, ManagedAPIKeysWriteStatus) {
	if s == nil || s.runtime == nil {
		result := managedAPIKeysUnavailableResult(fmt.Errorf("llm config service is required"))
		return BuildManagedAPIKeysSnapshot(result, map[string]string{}), ManagedAPIKeysWriteStatusStoreUnavailable
	}

	configs := s.runtime.Configs()
	attempt := WriteManagedAPIKeysWithExpectedRevision(
		s.managedAPIKeysPath,
		payload,
		expectedRevision,
		CollectAPIKeyNames(configs),
	)
	if attempt.Status == ManagedAPIKeysWriteStatusSuccess {
		s.runtime.UpdateAPIKeys(ResolveRuntimeAPIKeys(configs, attempt.APIKeys, s.processEnv()))
		return BuildManagedAPIKeysSnapshot(
			ManagedAPIKeysReadResult{
				APIKeys:  attempt.APIKeys,
				Revision: attempt.Revision,
			},
			ResolveEffectiveAPIKeys(configs, attempt.APIKeys, s.processEnv()),
		), attempt.Status
	}

	return BuildManagedAPIKeysSnapshot(
		ManagedAPIKeysReadResult{
			APIKeys:   attempt.APIKeys,
			Revision:  attempt.Revision,
			Corrupt:   attempt.Status == ManagedAPIKeysWriteStatusCorruptStore,
			ErrorCode: attempt.ErrorCode,
			Error:     attempt.Error,
		},
		ResolveEffectiveAPIKeys(configs, attempt.APIKeys, s.processEnv()),
	), attempt.Status
}

func (s *Service) applyConfigAndSyncManagedAPIKeys(configs AllConfigs) ManagedAPIKeysSnapshot {
	s.runtime.UpdateConfig(configs)
	readResult := ReadManagedAPIKeysWithStatus(s.managedAPIKeysPath)
	s.runtime.UpdateAPIKeys(ResolveRuntimeAPIKeys(configs, readResult.APIKeys, s.processEnv()))
	return s.buildManagedAPIKeysSnapshot(configs, readResult)
}

func (s *Service) buildManagedAPIKeysSnapshot(configs AllConfigs, readResult ManagedAPIKeysReadResult) ManagedAPIKeysSnapshot {
	return BuildManagedAPIKeysSnapshot(
		readResult,
		ResolveEffectiveAPIKeys(configs, readResult.APIKeys, s.processEnv()),
	)
}
