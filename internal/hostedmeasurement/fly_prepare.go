package hostedmeasurement

import (
	"context"
	"errors"
)

type CompositeFlyAppPreparer struct {
	IP      *FlyPublicIPPreparer
	Secrets *FlySecretStager
	values  FlyStagedSecrets
}

func NewCompositeFlyAppPreparer(
	secrets *FlySecretStager,
	ip *FlyPublicIPPreparer,
	values FlyStagedSecrets,
) (*CompositeFlyAppPreparer, error) {
	if secrets == nil || ip == nil {
		return nil, errors.New("Fly app preparation requires secret staging and shared ingress")
	}
	if !validFlyToken(values.SpriteToken) || !validFlyToken(values.InnerRuntimeCredential) {
		return nil, errors.New("Fly app preparation credentials are invalid")
	}
	values.SpriteToken = append([]byte(nil), values.SpriteToken...)
	values.InnerRuntimeCredential = append([]byte(nil), values.InnerRuntimeCredential...)
	return &CompositeFlyAppPreparer{Secrets: secrets, IP: ip, values: values}, nil
}

func (preparer *CompositeFlyAppPreparer) StageSecrets(ctx context.Context, appName string) error {
	return preparer.Secrets.Stage(ctx, appName, preparer.values)
}

func (preparer *CompositeFlyAppPreparer) EnsureSharedIPv4(ctx context.Context, appName string) error {
	return preparer.IP.EnsureSharedIPv4(ctx, appName)
}

var _ FlyAppPreparer = (*CompositeFlyAppPreparer)(nil)
