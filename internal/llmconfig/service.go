package llmconfig

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/statefs"
)

var ErrInvalidConfig = errors.New("invalid llm config")

type ServiceOptions struct {
	ConfigPath             string
	ManagedAPIKeysPath     string
	ManagedAPIKeysLockRoot string
	WorkspaceEnvPath       string
	Runtime                *Runtime
	ProcessEnv             func() map[string]string
}

type Service struct {
	configPath             string
	managedAPIKeysPath     string
	managedAPIKeysLockRoot string
	workspaceEnvPath       string
	runtime                *Runtime
	processEnv             func() map[string]string
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
	workspaceEnvPath := opts.WorkspaceEnvPath
	if workspaceEnvPath == "" {
		workspaceEnvPath = managedAPIKeysPath
	}
	resolvedWorkspaceEnvPath, err := statefs.NormalizePath(workspaceEnvPath, "")
	if err != nil {
		return nil, fmt.Errorf("resolve workspace env path: %w", err)
	}
	processEnv := opts.ProcessEnv
	if processEnv == nil {
		processEnv = CurrentProcessEnv
	}
	return &Service{
		configPath:             configPath,
		managedAPIKeysPath:     managedAPIKeysPath,
		managedAPIKeysLockRoot: opts.ManagedAPIKeysLockRoot,
		workspaceEnvPath:       resolvedWorkspaceEnvPath,
		runtime:                opts.Runtime,
		processEnv:             processEnv,
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
	return s.buildManagedAPIKeysSnapshot(
		s.Configs(),
		ReadManagedAPIKeysWithStatusInLockRoot(s.managedAPIKeysPath, s.managedAPIKeysLockRoot),
	)
}

func (s *Service) SaveManagedAPIKeys(payload map[string]string, expectedRevision int) (ManagedAPIKeysSnapshot, ManagedAPIKeysWriteStatus) {
	if s == nil || s.runtime == nil {
		result := managedAPIKeysUnavailableResult(fmt.Errorf("llm config service is required"))
		return BuildManagedAPIKeysSnapshot(result, map[string]string{}), ManagedAPIKeysWriteStatusStoreUnavailable
	}

	configs := s.runtime.Configs()
	workspaceEnv, workspaceEnvErr := s.readWorkspaceEnv()
	if workspaceEnvErr != nil {
		workspaceEnv = map[string]string{}
	}
	attempt := WriteManagedAPIKeysWithExpectedRevisionInLockRoot(
		s.managedAPIKeysPath,
		payload,
		expectedRevision,
		CollectAPIKeyNames(configs),
		s.managedAPIKeysLockRoot,
	)
	if attempt.Status == ManagedAPIKeysWriteStatusSuccess {
		s.runtime.UpdateAPIKeys(resolveRuntimeAPIKeysWithWorkspace(configs, attempt.APIKeys, workspaceEnv, s.processEnv()))
		return BuildManagedAPIKeysSnapshot(
			ManagedAPIKeysReadResult{
				APIKeys:  attempt.APIKeys,
				Revision: attempt.Revision,
			},
			resolveEffectiveAPIKeysWithWorkspace(configs, attempt.APIKeys, workspaceEnv, s.processEnv()),
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
		resolveEffectiveAPIKeysWithWorkspace(configs, attempt.APIKeys, workspaceEnv, s.processEnv()),
	), attempt.Status
}

func (s *Service) applyConfigAndSyncManagedAPIKeys(configs AllConfigs) ManagedAPIKeysSnapshot {
	s.runtime.UpdateConfig(configs)
	readResult := ReadManagedAPIKeysWithStatusInLockRoot(s.managedAPIKeysPath, s.managedAPIKeysLockRoot)
	workspaceEnv, err := s.readWorkspaceEnv()
	if err != nil {
		workspaceEnv = map[string]string{}
	}
	s.runtime.UpdateAPIKeys(resolveRuntimeAPIKeysWithWorkspace(configs, readResult.APIKeys, workspaceEnv, s.processEnv()))
	return s.buildManagedAPIKeysSnapshot(configs, readResult)
}

func (s *Service) buildManagedAPIKeysSnapshot(configs AllConfigs, readResult ManagedAPIKeysReadResult) ManagedAPIKeysSnapshot {
	workspaceEnv, err := s.readWorkspaceEnv()
	if err != nil {
		if readResult.ErrorCode != "" {
			return BuildManagedAPIKeysSnapshot(readResult, map[string]string{})
		}
		return BuildManagedAPIKeysSnapshot(managedAPIKeysUnavailableResult(err), map[string]string{})
	}
	return BuildManagedAPIKeysSnapshot(
		readResult,
		resolveEffectiveAPIKeysWithWorkspace(configs, readResult.APIKeys, workspaceEnv, s.processEnv()),
	)
}

func (s *Service) readWorkspaceEnv() (map[string]string, error) {
	if s == nil || s.workspaceEnvPath == "" {
		return map[string]string{}, nil
	}
	return ReadEnvFile(s.workspaceEnvPath)
}

func resolveRuntimeAPIKeysWithWorkspace(configs AllConfigs, managedEnv map[string]string, workspaceEnv map[string]string, processEnv map[string]string) map[string]string {
	merged := ResolveRuntimeAPIKeys(configs, workspaceEnv, processEnv)
	for key, value := range FilterEnvVarsForConfig(managedEnv, configs) {
		merged[key] = value
	}
	return merged
}

func resolveEffectiveAPIKeysWithWorkspace(configs AllConfigs, managedEnv map[string]string, workspaceEnv map[string]string, processEnv map[string]string) map[string]string {
	merged := map[string]string{}
	for key, value := range FilterEnvVarsForConfig(processEnv, configs) {
		merged[key] = value
	}
	for key, value := range FilterEnvVarsForConfig(workspaceEnv, configs) {
		merged[key] = value
	}
	for key, value := range cloneStringMap(managedEnv) {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		merged[trimmedKey] = value
	}
	return merged
}
