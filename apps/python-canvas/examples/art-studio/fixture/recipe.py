from art_studio import FlowInk, OrbitRings, StarField, render_gallery, show

layers = [FlowInk(), OrbitRings(), StarField()]
show(render_gallery(layers, seed=9, background="#0a1424", symmetry=3))
