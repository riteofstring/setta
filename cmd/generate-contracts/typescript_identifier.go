package main

import "strings"

func lowerCamel(value string) string {
	return strings.ToLower(value[:1]) + value[1:]
}

func isTypeScriptIdentifier(value string) bool {
	if value == "" || !isIdentifierStart(value[0]) {
		return false
	}
	for index := 1; index < len(value); index++ {
		if !isIdentifierContinue(value[index]) {
			return false
		}
	}
	return true
}

func isIdentifierStart(value byte) bool {
	return isUpperASCII(value) || (value >= 'a' && value <= 'z') || value == '_' || value == '$'
}

func isIdentifierContinue(value byte) bool {
	return isIdentifierStart(value) || (value >= '0' && value <= '9')
}

func isUpperASCII(value byte) bool {
	return value >= 'A' && value <= 'Z'
}
