package hostedmeasurement

import (
	"context"
	"errors"
)

type CompositeFlyAppPreparer struct {
	IP          *FlyPublicIPPreparer
	Secrets     *FlySecretStager
	spriteToken []byte
}

func NewCompositeFlyAppPreparer(
	secrets *FlySecretStager,
	ip *FlyPublicIPPreparer,
	spriteToken []byte,
) (*CompositeFlyAppPreparer, error) {
	if secrets == nil || ip == nil {
		return nil, errors.New("Fly app preparation requires secret staging and shared ingress")
	}
	if !validFlyToken(spriteToken) {
		return nil, errors.New("Fly app preparation Sprite credential is invalid")
	}
	return &CompositeFlyAppPreparer{
		Secrets: secrets, IP: ip, spriteToken: append([]byte(nil), spriteToken...),
	}, nil
}

func (preparer *CompositeFlyAppPreparer) StageSecrets(ctx context.Context, appName string, innerRuntimeCredential []byte) error {
	return preparer.Secrets.Stage(ctx, appName, FlyStagedSecrets{
		SpriteToken: preparer.spriteToken, InnerRuntimeCredential: innerRuntimeCredential,
	})
}

func (preparer *CompositeFlyAppPreparer) EnsureSharedIPv4(ctx context.Context, appName string) error {
	return preparer.IP.EnsureSharedIPv4(ctx, appName)
}

var _ FlyAppPreparer = (*CompositeFlyAppPreparer)(nil)
