package semanticgraph

import "errors"

var errSemanticCartographerDisabled = errors.New("semantic cartographer is disabled")

func (service *Service) semanticCartographerDisabled() bool {
	return service != nil && service.cartographerDisabled
}
