package runtime

import (
	"errors"
	"fmt"

	"setta/internal/speech"
)

type SpeechCredentialOwner string

const (
	SpeechCredentialOwnerElectronVault SpeechCredentialOwner = "electron_vault"
	SpeechCredentialOwnerServerStartup SpeechCredentialOwner = "server_startup"
)

func validateSpeechCredentialPolicy(owner SpeechCredentialOwner, startupAPIKey string) error {
	switch owner {
	case SpeechCredentialOwnerElectronVault:
		if startupAPIKey != "" {
			return errors.New("electron_vault speech credentials must not include a startup API key")
		}
	case SpeechCredentialOwnerServerStartup:
	default:
		return fmt.Errorf("unsupported speech credential owner %q", owner)
	}
	return nil
}

func validateSpeechConfig(
	config speech.OpenAIProviderConfig,
	owner SpeechCredentialOwner,
	startupAPIKey string,
) error {
	if err := validateSpeechCredentialPolicy(owner, startupAPIKey); err != nil {
		return err
	}
	controller, err := speech.NewOpenAIProviderController(config, startupAPIKey)
	if err != nil {
		return fmt.Errorf("speech configuration is invalid: %w", err)
	}
	controller.Shutdown()
	return nil
}
