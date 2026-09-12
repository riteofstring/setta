package cli

import (
	"errors"
	"flag"
	"time"
)

type runArgumentValues struct {
	url                         string
	pretty                      bool
	waitDiagnostics             bool
	diagnosticsTimeoutValue     string
	diagnosticsTimeoutSpecified bool
	runTimeoutValue             string
	runTimeoutSpecified         bool
}

func parseRunArguments(arguments []string) (runCommandOptions, bool, *commandFailure) {
	values, help, failure := parseRunArgumentValues(arguments)
	if help || failure != nil {
		return runCommandOptions{}, help, failure
	}
	options, failure := validateRunArguments(values)
	return options, false, failure
}

func parseRunArgumentValues(arguments []string) (runArgumentValues, bool, *commandFailure) {
	flags := newFlagSet("run")
	urlValue := flags.String("url", defaultServiceURL, "loopback Python Canvas service URL")
	pretty := flags.Bool("pretty", false, "indent JSON output")
	waitDiagnostics := flags.Bool("wait-diagnostics", false, "wait for current diagnostics")
	diagnosticsTimeoutValue := flags.String("diagnostics-timeout", "", "diagnostic wait timeout")
	runTimeoutValue := flags.String("run-timeout", "", "generated-program run timeout")
	if err := flags.Parse(arguments); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return runArgumentValues{}, true, nil
		}
		return runArgumentValues{}, false, inputFailure("invalid_input", "Run arguments are invalid.")
	}
	if flags.NArg() != 0 {
		return runArgumentValues{}, false, inputFailure("invalid_input", "Run does not accept positional arguments.")
	}
	values := runArgumentValues{
		url:                     *urlValue,
		pretty:                  *pretty,
		waitDiagnostics:         *waitDiagnostics,
		diagnosticsTimeoutValue: *diagnosticsTimeoutValue,
		runTimeoutValue:         *runTimeoutValue,
	}
	flags.Visit(func(value *flag.Flag) {
		switch value.Name {
		case "diagnostics-timeout":
			values.diagnosticsTimeoutSpecified = true
		case "run-timeout":
			values.runTimeoutSpecified = true
		}
	})
	return values, false, nil
}

func validateRunArguments(values runArgumentValues) (runCommandOptions, *commandFailure) {
	if _, err := validateServiceURL(values.url); err != nil {
		return runCommandOptions{}, inputFailure("invalid_url", "The service URL must be an absolute loopback HTTP URL without a base path, query, user info, or fragment.")
	}
	diagnosticsTimeout, failure := validateRunDiagnosticTimeout(values)
	if failure != nil {
		return runCommandOptions{}, failure
	}
	runTimeout, failure := validateRunTimeout(values)
	if failure != nil {
		return runCommandOptions{}, failure
	}
	return runCommandOptions{
		url:                values.url,
		pretty:             values.pretty,
		waitDiagnostics:    values.waitDiagnostics,
		diagnosticsTimeout: diagnosticsTimeout,
		runTimeout:         runTimeout,
	}, nil
}

func validateRunDiagnosticTimeout(values runArgumentValues) (time.Duration, *commandFailure) {
	if values.diagnosticsTimeoutSpecified && !values.waitDiagnostics {
		return 0, inputFailure("invalid_input", "--diagnostics-timeout requires --wait-diagnostics.")
	}
	if values.diagnosticsTimeoutSpecified && values.diagnosticsTimeoutValue == "" {
		return 0, inputFailure("invalid_input", "Diagnostic timeout must be greater than zero and no more than one minute.")
	}
	diagnosticsTimeout, failure := parseDiagnosticTimeout(values.diagnosticsTimeoutValue)
	if failure != nil {
		return 0, failure
	}
	if !values.waitDiagnostics {
		return 0, nil
	}
	return diagnosticsTimeout, nil
}

func validateRunTimeout(values runArgumentValues) (time.Duration, *commandFailure) {
	if values.runTimeoutSpecified && values.runTimeoutValue == "" {
		return 0, inputFailure("invalid_input", "Run timeout must be greater than zero and no more than five minutes.")
	}
	return parseRunTimeout(values.runTimeoutValue)
}

func parseRunTimeout(value string) (time.Duration, *commandFailure) {
	if value == "" {
		return defaultRunTimeout, nil
	}
	timeout, err := time.ParseDuration(value)
	if err != nil || timeout <= 0 || timeout > maxRunTimeout {
		return 0, inputFailure("invalid_input", "Run timeout must be greater than zero and no more than five minutes.")
	}
	return timeout, nil
}
