package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

type supportedProtocolInput struct {
	ClientMethods            []supportedClientMethod `json:"clientMethods"`
	ServerRequests           []string                `json:"serverRequests"`
	Notifications            []string                `json:"notifications"`
	UnsupportedNotifications []string                `json:"unsupportedNotifications"`
	Schemas                  []string                `json:"schemas"`
}

type supportedClientMethod struct {
	Method     string `json:"method"`
	ParamsName string `json:"paramsName,omitempty"`
	Source     string `json:"source,omitempty"`
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
	generator.supportedNotifications = supportedNotifications

	unsupportedNotifications, err := registeredMembers(
		input.UnsupportedNotifications,
		generator.notifications,
		"unsupported notification",
	)
	if err != nil {
		return err
	}
	supportedNotificationSet := memberMethodSet(supportedNotifications)
	for _, member := range unsupportedNotifications {
		if supportedNotificationSet[member.Method] {
			return fmt.Errorf("notification %s cannot be both supported and unsupported", member.Method)
		}
	}
	generator.unsupportedNotifications = unsupportedNotifications
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
		if member, ok := byMethod[entry.Method]; ok {
			if entry.ParamsName != "" && entry.ParamsName != member.ParamsName {
				return nil, nil, fmt.Errorf("client method %s paramsName = %s, upstream has %s", entry.Method, entry.ParamsName, member.ParamsName)
			}
			supported = append(supported, member)
			continue
		}
		if entry.ParamsName == "" {
			return nil, nil, fmt.Errorf("client method %s is not in the structured protocol snapshot and has no paramsName", entry.Method)
		}
		if entry.Source == "" {
			return nil, nil, fmt.Errorf("client method %s is not in the structured protocol snapshot and has no source", entry.Method)
		}
		if _, err := generator.schemaFilePath(entry.ParamsName); err != nil {
			return nil, nil, fmt.Errorf("client method %s params %s: %w", entry.Method, entry.ParamsName, err)
		}
		member := protocolMember{
			Method:     entry.Method,
			ConstName:  methodConstName(entry.Method),
			ParamsName: entry.ParamsName,
			Source:     entry.Source,
		}
		supported = append(supported, member)
		custom = append(custom, member)
	}
	sortMembers(supported)
	sortMembers(custom)
	return supported, custom, nil
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
