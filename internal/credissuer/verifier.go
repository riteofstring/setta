package credissuer

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

type verifierConfig struct {
	issuer           string
	audience         string
	runtimeName      string
	keySet           PublishedKeySet
	clock            func() time.Time
	maxCredentialTTL time.Duration
	clockSkew        time.Duration
}

func NewVerifier(config VerifierConfig) (*Verifier, error) {
	config = normalizeVerifierConfig(config)
	if err := validateVerifierConfig(config); err != nil {
		return nil, err
	}
	return &Verifier{
		issuer:           config.Issuer,
		audience:         config.Audience,
		runtimeName:      config.RuntimeName,
		keySet:           clonePublishedKeySet(config.KeySet),
		clock:            config.Clock,
		maxCredentialTTL: config.MaxCredentialTTL,
		clockSkew:        config.ClockSkew,
	}, nil
}

func (verifier *Verifier) Verify(token string) (VerifiedCredential, error) {
	return verifyToken(token, verifierConfig{
		issuer:           verifier.issuer,
		audience:         verifier.audience,
		runtimeName:      verifier.runtimeName,
		keySet:           verifier.keySet,
		clock:            verifier.clock,
		maxCredentialTTL: verifier.maxCredentialTTL,
		clockSkew:        verifier.clockSkew,
	})
}

func (verifier *Verifier) VerifyRuntimeAccessCredential(_ context.Context, token string) (VerifiedCredential, bool, error) {
	credential, err := verifier.Verify(token)
	if err != nil {
		if isCredentialAuthorizationError(err) {
			return VerifiedCredential{}, false, nil
		}
		return VerifiedCredential{}, false, err
	}
	return credential, true, nil
}

func verifyToken(token string, config verifierConfig) (VerifiedCredential, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return VerifiedCredential{}, ErrInvalidCredential
	}
	header, key, err := verifyCredentialHeader(parts, config.keySet)
	if err != nil {
		return VerifiedCredential{}, err
	}
	claims, err := decodeCredentialClaims(parts[1])
	if err != nil {
		return VerifiedCredential{}, err
	}
	if err := validateCredentialContext(claims, key, config); err != nil {
		return VerifiedCredential{}, err
	}
	if err := validateClaimsTiming(claims, config.clock().UTC(), config.maxCredentialTTL, config.clockSkew); err != nil {
		return VerifiedCredential{}, err
	}
	return VerifiedCredential{KeyID: header.KeyID, Claims: claims}, nil
}

func verifyCredentialHeader(parts []string, keySet PublishedKeySet) (credentialHeader, PublishedKey, error) {
	headerPayload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return credentialHeader{}, PublishedKey{}, ErrInvalidCredential
	}
	var header credentialHeader
	if err := decodeStrict(headerPayload, &header); err != nil {
		return credentialHeader{}, PublishedKey{}, fmt.Errorf("%w: malformed credential header", ErrInvalidCredential)
	}
	if header.Algorithm != CredentialAlgorithm || header.Type != "setta-runtime-access" || header.KeyID == "" {
		return credentialHeader{}, PublishedKey{}, ErrInvalidCredential
	}
	key, ok := publicKeyForID(keySet, header.KeyID)
	if !ok {
		return credentialHeader{}, PublishedKey{}, ErrInvalidCredential
	}
	if key.Algorithm != CredentialAlgorithm || len(key.PublicKey) != ed25519.PublicKeySize {
		return credentialHeader{}, PublishedKey{}, ErrInvalidCredential
	}
	if err := verifyCredentialSignature(parts, key); err != nil {
		return credentialHeader{}, PublishedKey{}, err
	}
	return header, key, nil
}

func verifyCredentialSignature(parts []string, key PublishedKey) error {
	signingInput := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(signature) != ed25519.SignatureSize {
		return ErrInvalidCredential
	}
	if !ed25519.Verify(ed25519.PublicKey(key.PublicKey), []byte(signingInput), signature) {
		return ErrInvalidCredential
	}
	return nil
}

func decodeCredentialClaims(encoded string) (CredentialClaims, error) {
	claimsPayload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return CredentialClaims{}, ErrInvalidCredential
	}
	var claims CredentialClaims
	if err := decodeStrict(claimsPayload, &claims); err != nil {
		return CredentialClaims{}, fmt.Errorf("%w: malformed credential claims", ErrInvalidCredential)
	}
	return claims, nil
}

func validateCredentialContext(claims CredentialClaims, key PublishedKey, config verifierConfig) error {
	if claims.Issuer != config.issuer {
		return ErrCredentialIssuerMismatch
	}
	if claims.Audience != config.audience {
		return ErrCredentialAudienceMismatch
	}
	if config.runtimeName != "" && claims.RuntimeName != config.runtimeName {
		return ErrCredentialRuntimeMismatch
	}
	if key.ExpiresAt != nil && config.clock().UTC().After(key.ExpiresAt.Add(config.clockSkew)) {
		return ErrInvalidCredential
	}
	return nil
}

func validateClaimsTiming(claims CredentialClaims, now time.Time, maxTTL time.Duration, clockSkew time.Duration) error {
	if missingRequiredCredentialClaim(claims) {
		return ErrInvalidCredential
	}
	if err := runtimeprovider.ValidateManagedName(claims.RuntimeName); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCredential, err)
	}
	if !claims.ExpiresAt.After(claims.IssuedAt) {
		return ErrInvalidCredential
	}
	if claims.ExpiresAt.Sub(claims.IssuedAt) > maxTTL {
		return ErrInvalidCredential
	}
	if claims.IssuedAt.After(now.Add(clockSkew)) {
		return ErrCredentialNotYetValid
	}
	if now.After(claims.ExpiresAt.Add(clockSkew)) {
		return ErrCredentialExpired
	}
	return nil
}

func missingRequiredCredentialClaim(claims CredentialClaims) bool {
	return strings.TrimSpace(claims.CredentialID) == "" ||
		strings.TrimSpace(claims.UserID) == "" ||
		strings.TrimSpace(claims.DeviceID) == "" ||
		claims.CredentialEpoch == 0 ||
		claims.IssuedAt.IsZero() ||
		claims.ExpiresAt.IsZero()
}

func publicKeyForID(keySet PublishedKeySet, keyID string) (PublishedKey, bool) {
	for _, key := range keySet.Keys {
		if key.ID == keyID {
			return key, true
		}
	}
	return PublishedKey{}, false
}
