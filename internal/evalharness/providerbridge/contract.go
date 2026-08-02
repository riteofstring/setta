package providerbridge

const (
	AddressEnvironment = "SETTA_EVAL_PROVIDER_BRIDGE_ADDR"
	TokenEnvironment   = "SETTA_EVAL_PROVIDER_BRIDGE_TOKEN"
	ProtocolVersion    = "SETTA-EVAL-PROVIDER-BRIDGE/1"
	Acknowledgement    = "OK\n"
)

// Handshake returns the one accepted controller-to-host authentication line.
func Handshake(token string) string {
	return ProtocolVersion + " " + token + "\n"
}

// ValidToken accepts only a freshly generated 256-bit lowercase hex token.
func ValidToken(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, character := range value {
		if character >= '0' && character <= '9' || character >= 'a' && character <= 'f' {
			continue
		}
		return false
	}
	return true
}
