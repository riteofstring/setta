package frontendbindings

func mustRenderFrontendBindingTemplate(context string, source string, data any) string {
	rendered, err := renderTemplate(source, data)
	if err != nil {
		panic("render " + context + " template: " + err.Error())
	}
	return rendered
}
