package main

import (
	"errors"
	"fmt"
	"strings"
)

type provisionInspectOptions struct {
	AppDataDir  string
	JSON        bool
	Provider    string
	RuntimeName string
	StackName   string
}

type provisionInspectResult struct {
	OK             bool                          `json:"ok"`
	Provider       string                        `json:"provider"`
	RecordID       string                        `json:"recordId"`
	Exists         bool                          `json:"exists"`
	CreationRecord *provisionCreationRecord      `json:"creationRecord,omitempty"`
	NextActions    []provisionCreationNextAction `json:"nextActions,omitempty"`
}

func runProvisionInspect(args []string, deps cliDeps) error {
	options, err := provisionInspectOptionsFromArgs(args, deps)
	if err != nil {
		return err
	}
	recordID, err := provisionInspectRecordID(options)
	if err != nil {
		return err
	}
	store := newProvisionCreationStore(options.AppDataDir, deps)
	record, exists, err := store.find(recordID)
	if err != nil {
		return err
	}
	result := provisionInspectResult{
		OK:       true,
		Provider: options.Provider,
		RecordID: recordID,
		Exists:   exists,
	}
	if exists {
		result.CreationRecord = &record
		result.NextActions = provisionCreationRecordNextActions(record)
	}
	return encodeProvisionJSON(deps, result, "inspect JSON")
}

func provisionInspectOptionsFromArgs(args []string, deps cliDeps) (provisionInspectOptions, error) {
	var options provisionInspectOptions
	flagSet := newFlagSet("setta provision inspect", deps.stderr)
	flagSet.BoolVar(&options.JSON, "json", false, "emit structured JSON")
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", "", "directory for non-secret provisioning creation records")
	flagSet.StringVar(&options.Provider, "provider", "", "provider id")
	flagSet.StringVar(&options.RuntimeName, "runtime-name", "", "runtime name to inspect")
	flagSet.StringVar(&options.StackName, "stack-name", "", "AWS CloudFormation stack name")
	if err := flagSet.Parse(args); err != nil {
		return provisionInspectOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return provisionInspectOptions{}, usageError{err: errors.New("setta provision inspect does not accept positional arguments")}
	}
	return normalizeProvisionInspectOptions(options, deps)
}

func normalizeProvisionInspectOptions(options provisionInspectOptions, deps cliDeps) (provisionInspectOptions, error) {
	if !options.JSON {
		return provisionInspectOptions{}, usageError{err: errors.New("setta provision inspect requires --json")}
	}
	provider := strings.TrimSpace(options.Provider)
	if provider == "" {
		return provisionInspectOptions{}, usageError{err: errors.New("setta provision inspect requires --provider")}
	}
	catalog, err := loadProvisionCatalog()
	if err != nil {
		return provisionInspectOptions{}, err
	}
	if _, ok := provisionCatalogProviderByID(catalog, provider); !ok {
		return provisionInspectOptions{}, usageError{err: fmt.Errorf("unknown provider %q", provider)}
	}
	runtimeName, err := validateCloudInitHostname(options.RuntimeName)
	if err != nil {
		return provisionInspectOptions{}, err
	}
	appDataDir, err := provisionAppDataDir(options.AppDataDir, deps)
	if err != nil {
		return provisionInspectOptions{}, err
	}
	options.AppDataDir = appDataDir
	options.Provider = provider
	options.RuntimeName = runtimeName
	options.StackName = strings.TrimSpace(options.StackName)
	return options, nil
}

func provisionInspectRecordID(options provisionInspectOptions) (string, error) {
	expectedResourceName, err := provisionCreationExpectedResourceName(provisionUpOptions{
		Provider:    options.Provider,
		RuntimeName: options.RuntimeName,
		StackName:   options.StackName,
	})
	if err != nil {
		return "", err
	}
	return provisionCreationRecordID(options.Provider, expectedResourceName), nil
}
