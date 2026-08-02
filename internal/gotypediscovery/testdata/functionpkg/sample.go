package functionpkg

type Widget struct{}

func FrontendDefaultWidget() Widget {
	return Widget{}
}

func FrontendDefaultIgnoredWithParams(_ string) Widget {
	return Widget{}
}

func FrontendDefaultIgnoredWithoutReturn() {}

func (Widget) FrontendDefaultIgnoredMethod() Widget {
	return Widget{}
}

// setta-go-type-discovery: skip
func FrontendDefaultSkipped() Widget {
	return Widget{}
}

func helperWidget() Widget {
	return Widget{}
}
