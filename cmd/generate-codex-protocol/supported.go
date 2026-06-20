package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

type supportedProtocolInput struct {
	ClientMethods             []supportedClientMethod             `json:"clientMethods"`
	ServerRequests            []string                            `json:"serverRequests"`
	Notifications             []string                            `json:"notifications"`
	ExperimentalNotifications []supportedExperimentalNotification `json:"experimentalNotifications,omitempty"`
	Schemas                   []string                            `json:"schemas"`
}

type supportedClientMethod struct {
	Method       string `json:"method"`
	ParamsName   string `json:"paramsName,omitempty"`
	Source       string `json:"source,omitempty"`
	Experimental bool   `json:"experimental,omitempty"`
}

type supportedExperimentalNotification struct {
	Method     string `json:"method"`
	ParamsName string `json:"paramsName,omitempty"`
	Source     string `json:"source"`
}

func (generator *generator) loadSupportedProtocol() (supportedProtocolInput, error) {
	data, err := os.ReadFile(generator.supportedPath)
	if err != nil {
		return supportedProtocolInput{}, fmt.Errorf("read supported protocol registration: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var input supportedProtocolInput
	if err := decoder.Decode(&input); err != nil {
		return supportedProtocolInput{}, fmt.Errorf("parse supported protocol registration: %w", err)
	}
	return input, nil
}

func (generator *generator) applySupportedProtocol(input supportedProtocolInput) error {
	supportedClientMethods, customClientMethods, err := generator.supportedClientMethodMembers(input.ClientMethods)
	if err != nil {
		return err
	}
	generator.clientMethods = mergeMembers(generator.clientMethods, customClientMethods)
	generator.supportedClientMethods = supportedClientMethods

	supportedServerRequests, err := registeredMembers(
		input.ServerRequests,
		generator.serverRequests,
		"server request",
	)
	if err != nil {
		return err
	}
	generator.supportedServerRequests = supportedServerRequests

	supportedNotifications, err := registeredMembers(
		input.Notifications,
		generator.notifications,
		"notification",
	)
	if err != nil {
		return err
	}
	experimentalNotifications, err := generator.experimentalNotificationMembers(
		input.ExperimentalNotifications,
	)
	if err != nil {
		return err
	}
	generator.notifications = mergeMembers(generator.notifications, experimentalNotifications)
	generator.supportedNotifications = mergeMembers(
		supportedNotifications,
		experimentalNotifications,
	)

	return nil
}

func (generator *generator) supportedClientMethodMembers(input []supportedClientMethod) ([]protocolMember, []protocolMember, error) {
	byMethod := membersByMethod(generator.clientMethods)
	seen := map[string]bool{}
	supported := make([]protocolMember, 0, len(input))
	custom := []protocolMember{}
	for _, entry := range input {
		if entry.Method == "" {
			return nil, nil, fmt.Errorf("client method registration has empty method")
		}
		if seen[entry.Method] {
			return nil, nil, fmt.Errorf("client method %s registered more than once", entry.Method)
		}
		seen[entry.Method] = true
		member, isCustom, err := generator.supportedClientMethodMember(entry, byMethod)
		if err != nil {
			return nil, nil, err
		}
		supported = append(supported, member)
		if isCustom {
			custom = append(custom, member)
		}
	}
	sortMembers(supported)
	sortMembers(custom)
	return supported, custom, nil
}

func (generator *generator) supportedClientMethodMember(entry supportedClientMethod, byMethod map[string]protocolMember) (protocolMember, bool, error) {
	if member, ok := byMethod[entry.Method]; ok {
		return stableClientMethodMember(entry, member)
	}
	member, err := generator.experimentalClientMethodMember(entry)
	if err != nil {
		return protocolMember{}, false, err
	}
	return member, true, nil
}

func stableClientMethodMember(entry supportedClientMethod, member protocolMember) (protocolMember, bool, error) {
	if entry.Experimental {
		return protocolMember{}, false, fmt.Errorf("client method %s is already in the stable structured protocol snapshot and cannot be registered as experimental", entry.Method)
	}
	if entry.ParamsName != "" && entry.ParamsName != member.ParamsName {
		return protocolMember{}, false, fmt.Errorf("client method %s paramsName = %s, upstream has %s", entry.Method, entry.ParamsName, member.ParamsName)
	}
	return member, false, nil
}

func (generator *generator) experimentalClientMethodMember(entry supportedClientMethod) (protocolMember, error) {
	if entry.ParamsName == "" {
		return protocolMember{}, fmt.Errorf("client method %s is not in the structured protocol snapshot and has no paramsName", entry.Method)
	}
	if entry.Source == "" {
		return protocolMember{}, fmt.Errorf("client method %s is not in the structured protocol snapshot and has no source", entry.Method)
	}
	if !entry.Experimental {
		return protocolMember{}, fmt.Errorf("client method %s is not in the stable structured protocol snapshot and must be registered as experimental", entry.Method)
	}
	if _, err := generator.experimentalSchemaFilePath(entry.ParamsName); err != nil {
		return protocolMember{}, fmt.Errorf("client method %s params %s: %w", entry.Method, entry.ParamsName, err)
	}
	return protocolMember{
		Method:       entry.Method,
		ConstName:    methodConstName(entry.Method),
		ParamsName:   entry.ParamsName,
		Source:       entry.Source,
		Experimental: true,
	}, nil
}

func (generator *generator) experimentalNotificationMembers(input []supportedExperimentalNotification) ([]protocolMember, error) {
	byMethod := membersByMethod(generator.notifications)
	seen := map[string]bool{}
	members := make([]protocolMember, 0, len(input))
	for _, entry := range input {
		if entry.Method == "" {
			return nil, fmt.Errorf("experimental notification registration has empty method")
		}
		if seen[entry.Method] {
			return nil, fmt.Errorf("experimental notification %s registered more than once", entry.Method)
		}
		seen[entry.Method] = true
		member, err := generator.experimentalNotificationMember(entry, byMethod)
		if err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	sortMembers(members)
	return members, nil
}

func (generator *generator) experimentalNotificationMember(entry supportedExperimentalNotification, byMethod map[string]protocolMember) (protocolMember, error) {
	if _, ok := byMethod[entry.Method]; ok {
		return protocolMember{}, fmt.Errorf("notification %s is already in the stable structured protocol snapshot and cannot be registered as experimental", entry.Method)
	}
	if entry.Source == "" {
		return protocolMember{}, fmt.Errorf("experimental notification %s has no source", entry.Method)
	}
	if entry.ParamsName != "" {
		if _, err := generator.experimentalSchemaFilePath(entry.ParamsName); err != nil {
			return protocolMember{}, fmt.Errorf("experimental notification %s params %s: %w", entry.Method, entry.ParamsName, err)
		}
	}
	return protocolMember{
		Method:       entry.Method,
		ConstName:    methodConstName(entry.Method),
		ParamsName:   entry.ParamsName,
		Source:       entry.Source,
		Experimental: true,
	}, nil
}

func registeredMembers(methods []string, available []protocolMember, label string) ([]protocolMember, error) {
	byMethod := membersByMethod(available)
	seen := map[string]bool{}
	members := make([]protocolMember, 0, len(methods))
	for _, method := range methods {
		if method == "" {
			return nil, fmt.Errorf("%s registration has empty method", label)
		}
		if seen[method] {
			return nil, fmt.Errorf("%s %s registered more than once", label, method)
		}
		seen[method] = true
		member, ok := byMethod[method]
		if !ok {
			return nil, fmt.Errorf("%s %s is missing from the structured protocol snapshot", label, method)
		}
		members = append(members, member)
	}
	sortMembers(members)
	return members, nil
}

func sortMembers(members []protocolMember) {
	sort.Slice(members, func(left int, right int) bool {
		return members[left].Method < members[right].Method
	})
}

func memberMethodSet(members []protocolMember) map[string]bool {
	set := map[string]bool{}
	for _, member := range members {
		set[member.Method] = true
	}
	return set
}

func (generator *generator) collectSchemasFromSupported(input supportedProtocolInput) error {
	if err := generator.collectClientMethodSchemas(memberMethodSet(generator.supportedClientMethods)); err != nil {
		return err
	}
	if err := generator.collectMemberSchemas(generator.supportedNotifications, memberMethodSet(generator.supportedNotifications), "notification params"); err != nil {
		return err
	}
	if err := generator.collectMemberSchemas(generator.supportedServerRequests, memberMethodSet(generator.supportedServerRequests), "server request params"); err != nil {
		return err
	}
	for _, name := range input.Schemas {
		if name == "" {
			return fmt.Errorf("supported schema registration has empty name")
		}
		if err := generator.enqueueNamedSchema(name); err != nil {
			return fmt.Errorf("supported schema %s: %w", name, err)
		}
	}
	return generator.walkSchemaQueue()
}
