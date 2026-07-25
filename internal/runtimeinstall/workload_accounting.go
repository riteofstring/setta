package runtimeinstall

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"strconv"

	"setta/internal/controlplane"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimereporting"
)

type WorkloadAccountingConfig struct {
	BaseURL    string
	Credential controlplane.RuntimeReportingCredential
}

func validateWorkloadAccounting(config *WorkloadAccountingConfig) error {
	if config == nil {
		return nil
	}
	_, err := runtimereporting.NewClient(runtimereporting.ClientConfig{
		BaseURL:    config.BaseURL,
		Credential: config.Credential,
	})
	if err != nil {
		return fmt.Errorf("%w: invalid workload accounting configuration: %v", runtimeprovider.ErrInvalidContract, err)
	}
	return nil
}

func (loop Loop) writeOptionalWorkloadAccounting(
	ctx context.Context,
	request InstallRequest,
	layout Layout,
) error {
	if request.WorkloadAccounting == nil {
		return nil
	}
	payload, err := json.Marshal(request.WorkloadAccounting.Credential)
	if err != nil {
		return errors.New("encode workload accounting credential")
	}
	payload = append(payload, '\n')
	credentialPath := workloadAccountingCredentialPath(layout)
	temporaryPath := credentialPath + ".tmp"
	owner := layout.TrustedRuntimeIdentity
	if err := loop.writeRemoteBytes(
		ctx,
		request.RuntimeName,
		temporaryPath,
		payload,
		"write workload accounting credential",
	); err != nil {
		return err
	}
	if err := loop.execRequired(
		ctx,
		request.RuntimeName,
		"/bin/chmod",
		[]string{"0600", temporaryPath},
		nil,
		"protect workload accounting credential",
	); err != nil {
		return err
	}
	if err := loop.execRequired(
		ctx,
		request.RuntimeName,
		"/bin/chown",
		[]string{ownerGroup(owner), temporaryPath},
		nil,
		"own workload accounting credential",
	); err != nil {
		return err
	}
	return loop.execRequired(
		ctx,
		request.RuntimeName,
		"/bin/mv",
		[]string{temporaryPath, credentialPath},
		nil,
		"publish workload accounting credential",
	)
}

func workloadAccountingCredentialPath(layout Layout) string {
	return path.Join(layout.RuntimeStateDir, "runtime-reporting-credential.json")
}

func runtimeServiceArguments(
	layout Layout,
	workloadAccounting *WorkloadAccountingConfig,
) []string {
	arguments := []string{
		"serve",
		"--app-data-dir", layout.RuntimeStateDir,
		"--port", strconv.Itoa(layout.HealthPort),
	}
	if workloadAccounting != nil {
		arguments = append(
			arguments,
			"--sprites-workload-leases",
			"--workload-accounting-url", workloadAccounting.BaseURL,
			"--workload-accounting-credential-file", workloadAccountingCredentialPath(layout),
		)
	}
	return arguments
}
