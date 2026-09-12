package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

const size = 512

type request struct {
	ProtocolVersion string        `json:"protocolVersion"`
	RunID           string        `json:"runId"`
	Case            candidateCase `json:"case"`
	OutputDirectory string        `json:"outputDirectory"`
}

type candidateCase struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Input    json.RawMessage `json:"input"`
	Expected json.RawMessage `json:"expected"`
}

type thumbnailInput struct {
	Image      string  `json:"image"`
	Path       string  `json:"path"`
	Background string  `json:"background"`
	FocalX     float64 `json:"focalX"`
	FocalY     float64 `json:"focalY"`
}

type artifact struct {
	Name      string `json:"name"`
	MediaType string `json:"mediaType"`
	Path      string `json:"path"`
}

type result struct {
	Type         string         `json:"type"`
	Output       map[string]any `json:"output"`
	Observations []any          `json:"observations"`
	Artifacts    []artifact     `json:"artifacts"`
}

type swatch struct {
	start      color.NRGBA
	end        color.NRGBA
	object     color.NRGBA
	highlight  color.NRGBA
	width      int
	height     int
	shape      int
	accentSeed int
}

func main() {
	if len(os.Args) < 2 {
		fatal(errors.New("expected generate or run"))
	}
	var err error
	switch os.Args[1] {
	case "generate":
		err = generate(os.Args[2:])
	case "run":
		err = run(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fatal(err)
	}
}

func generate(arguments []string) error {
	flags := flag.NewFlagSet("generate", flag.ContinueOnError)
	output := flags.String("output", "", "")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if *output == "" {
		return errors.New("generate requires --output")
	}
	if err := os.MkdirAll(*output, 0o755); err != nil {
		return err
	}
	items := []swatch{
		{hex("f8b84e"), hex("eb5664"), hex("164d72"), hex("ffffff"), 820, 520, 0, 3},
		{hex("5ad1d8"), hex("4867c7"), hex("f6c453"), hex("ffffff"), 480, 760, 1, 7},
		{hex("f4d35e"), hex("ee964b"), hex("3d348b"), hex("ffffff"), 720, 720, 2, 11},
		{hex("ed6a5a"), hex("f4f1bb"), hex("36c9c6"), hex("1f2d3d"), 900, 480, 3, 17},
		{hex("815ac0"), hex("2c73d2"), hex("ff9671"), hex("ffffff"), 460, 820, 4, 23},
		{hex("00c9a7"), hex("008b74"), hex("ffc75f"), hex("ffffff"), 840, 560, 0, 29},
		{hex("ff6f91"), hex("845ec2"), hex("f9f871"), hex("ffffff"), 540, 780, 1, 31},
		{hex("4d8076"), hex("b0a8b9"), hex("c34a36"), hex("ffffff"), 760, 620, 2, 37},
		{hex("2c699a"), hex("048ba8"), hex("f0c808"), hex("ffffff"), 960, 500, 3, 41},
		{hex("ff8066"), hex("4e8397"), hex("d5cabd"), hex("ffffff"), 500, 900, 4, 43},
	}
	for index, item := range items {
		path := filepath.Join(*output, fmt.Sprintf("product-%02d.png", index+1))
		if err := writePNG(path, productImage(item)); err != nil {
			return err
		}
	}
	return nil
}

func run(arguments []string) error {
	mode, err := parseRunMode(arguments)
	if err != nil {
		return err
	}
	envelope, input, sourcePath, err := decodeRunRequest()
	if err != nil {
		return err
	}
	source, err := readImage(sourcePath)
	if err != nil {
		return err
	}
	background, focalX, focalY := renderingOptions(input)
	thumbnail := transform(source, mode, background, focalX, focalY)
	name, err := saveThumbnail(envelope.OutputDirectory, thumbnail)
	if err != nil {
		return err
	}
	return writeRunResult(mode, name)
}

func parseRunMode(arguments []string) (string, error) {
	flags := flag.NewFlagSet("run", flag.ContinueOnError)
	mode := flags.String("mode", "", "")
	if err := flags.Parse(arguments); err != nil {
		return "", err
	}
	if *mode != "contain" && *mode != "cover" {
		return "", errors.New("run requires --mode contain or --mode cover")
	}
	return *mode, nil
}

func decodeRunRequest() (request, thumbnailInput, string, error) {
	var envelope request
	if err := json.NewDecoder(os.Stdin).Decode(&envelope); err != nil {
		return request{}, thumbnailInput{}, "", fmt.Errorf("decode request: %w", err)
	}
	if envelope.ProtocolVersion != "bench-candidate/v1" {
		return request{}, thumbnailInput{}, "", fmt.Errorf("unsupported protocol %q", envelope.ProtocolVersion)
	}
	var input thumbnailInput
	if err := json.Unmarshal(envelope.Case.Input, &input); err != nil {
		return request{}, thumbnailInput{}, "", fmt.Errorf("decode input: %w", err)
	}
	path := input.Image
	if path == "" {
		path = input.Path
	}
	if path == "" || envelope.OutputDirectory == "" {
		return request{}, thumbnailInput{}, "", errors.New("request requires an image and outputDirectory")
	}
	return envelope, input, path, nil
}

func renderingOptions(input thumbnailInput) (color.NRGBA, float64, float64) {
	background := hex(input.Background)
	if input.Background == "" {
		background = hex("f4f1ea")
	}
	focalX, focalY := input.FocalX, input.FocalY
	if focalX < 0 || focalX > 1 {
		focalX = 0.5
	}
	if focalY < 0 || focalY > 1 {
		focalY = 0.5
	}
	if focalX == 0 && focalY == 0 {
		focalX, focalY = 0.5, 0.5
	}
	return background, focalX, focalY
}

func saveThumbnail(outputDirectory string, thumbnail image.Image) (string, error) {
	if err := os.MkdirAll(outputDirectory, 0o755); err != nil {
		return "", fmt.Errorf("create output directory: %w", err)
	}
	name := "thumbnail.png"
	if err := writePNG(filepath.Join(outputDirectory, name), thumbnail); err != nil {
		return "", err
	}
	return name, nil
}

func writeRunResult(mode string, name string) error {
	response := result{
		Type: "result",
		Output: map[string]any{
			"format": "png",
			"mode":   mode,
			"width":  size,
			"height": size,
		},
		Observations: []any{},
		Artifacts:    []artifact{{Name: "thumbnail", MediaType: "image/png", Path: name}},
	}
	return json.NewEncoder(os.Stdout).Encode(response)
}

func productImage(item swatch) *image.NRGBA {
	canvas := image.NewNRGBA(image.Rect(0, 0, item.width, item.height))
	for y := 0; y < item.height; y++ {
		t := float64(y) / float64(max(item.height-1, 1))
		row := blend(item.start, item.end, t)
		for x := 0; x < item.width; x++ {
			canvas.SetNRGBA(x, y, row)
		}
	}
	for index := 0; index < 7; index++ {
		x := (index*137 + item.accentSeed*29) % item.width
		y := (index*83 + item.accentSeed*47) % item.height
		radius := 18 + (index*item.accentSeed)%55
		circle(canvas, x, y, radius, withAlpha(item.highlight, 62))
	}
	cx, cy := item.width/2, item.height/2
	objectWidth := min(item.width*2/5, item.height*2/5)
	switch item.shape {
	case 0:
		roundedRect(canvas, cx-objectWidth/3, cy-objectWidth/2, objectWidth*2/3, objectWidth, objectWidth/7, item.object)
		roundedRect(canvas, cx-objectWidth/6, cy-objectWidth*3/5, objectWidth/3, objectWidth/5, objectWidth/12, item.highlight)
	case 1:
		circle(canvas, cx, cy, objectWidth/2, item.object)
		circle(canvas, cx-objectWidth/7, cy-objectWidth/8, objectWidth/7, item.highlight)
	case 2:
		polygon(canvas, []image.Point{{cx, cy - objectWidth/2}, {cx + objectWidth/2, cy + objectWidth/2}, {cx - objectWidth/2, cy + objectWidth/2}}, item.object)
		circle(canvas, cx, cy+objectWidth/7, objectWidth/9, item.highlight)
	case 3:
		roundedRect(canvas, cx-objectWidth/2, cy-objectWidth/5, objectWidth, objectWidth*2/5, objectWidth/5, item.object)
		circle(canvas, cx-objectWidth/3, cy+objectWidth/5, objectWidth/7, item.highlight)
		circle(canvas, cx+objectWidth/3, cy+objectWidth/5, objectWidth/7, item.highlight)
	case 4:
		polygon(canvas, []image.Point{{cx - objectWidth/2, cy + objectWidth/3}, {cx - objectWidth/5, cy - objectWidth/2}, {cx + objectWidth/5, cy - objectWidth/2}, {cx + objectWidth/2, cy + objectWidth/3}}, item.object)
		roundedRect(canvas, cx-objectWidth/3, cy+objectWidth/4, objectWidth*2/3, objectWidth/7, objectWidth/14, item.highlight)
	}
	return canvas
}

func transform(source image.Image, mode string, background color.NRGBA, focalX, focalY float64) *image.NRGBA {
	destination := image.NewNRGBA(image.Rect(0, 0, size, size))
	draw.Draw(destination, destination.Bounds(), &image.Uniform{C: background}, image.Point{}, draw.Src)
	bounds := source.Bounds()
	sourceWidth, sourceHeight := bounds.Dx(), bounds.Dy()
	scaleX := float64(size) / float64(sourceWidth)
	scaleY := float64(size) / float64(sourceHeight)
	scale := math.Min(scaleX, scaleY)
	if mode == "cover" {
		scale = math.Max(scaleX, scaleY)
	}
	scaledWidth := int(math.Round(float64(sourceWidth) * scale))
	scaledHeight := int(math.Round(float64(sourceHeight) * scale))
	offsetX := (size - scaledWidth) / 2
	offsetY := (size - scaledHeight) / 2
	if mode == "cover" {
		offsetX = int(math.Round(float64(size-scaledWidth) * focalX))
		offsetY = int(math.Round(float64(size-scaledHeight) * focalY))
	}
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			sx := (float64(x-offsetX)+0.5)/scale - 0.5 + float64(bounds.Min.X)
			sy := (float64(y-offsetY)+0.5)/scale - 0.5 + float64(bounds.Min.Y)
			if sx >= float64(bounds.Min.X) && sx < float64(bounds.Max.X) && sy >= float64(bounds.Min.Y) && sy < float64(bounds.Max.Y) {
				destination.SetNRGBA(x, y, sample(source, sx, sy))
			}
		}
	}
	return destination
}

func sample(source image.Image, x, y float64) color.NRGBA {
	bounds := source.Bounds()
	x0 := clamp(int(math.Floor(x)), bounds.Min.X, bounds.Max.X-1)
	y0 := clamp(int(math.Floor(y)), bounds.Min.Y, bounds.Max.Y-1)
	x1 := clamp(x0+1, bounds.Min.X, bounds.Max.X-1)
	y1 := clamp(y0+1, bounds.Min.Y, bounds.Max.Y-1)
	tx, ty := x-math.Floor(x), y-math.Floor(y)
	a := nrgba(source.At(x0, y0))
	b := nrgba(source.At(x1, y0))
	c := nrgba(source.At(x0, y1))
	d := nrgba(source.At(x1, y1))
	return blend(blend(a, b, tx), blend(c, d, tx), ty)
}

func readImage(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open image: %w", err)
	}
	defer file.Close()
	decoded, err := png.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}
	return decoded, nil
}

func writePNG(path string, source image.Image) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("create image: %w", err)
	}
	err = png.Encode(file, source)
	closeErr := file.Close()
	if err != nil {
		return fmt.Errorf("encode image: %w", err)
	}
	return closeErr
}

func roundedRect(destination *image.NRGBA, x, y, width, height, radius int, fill color.NRGBA) {
	for py := y; py < y+height; py++ {
		for px := x; px < x+width; px++ {
			dx := max(max(x+radius-px, 0), px-(x+width-radius-1))
			dy := max(max(y+radius-py, 0), py-(y+height-radius-1))
			if dx*dx+dy*dy <= radius*radius {
				composite(destination, px, py, fill)
			}
		}
	}
}

func circle(destination *image.NRGBA, cx, cy, radius int, fill color.NRGBA) {
	for y := cy - radius; y <= cy+radius; y++ {
		for x := cx - radius; x <= cx+radius; x++ {
			if (x-cx)*(x-cx)+(y-cy)*(y-cy) <= radius*radius {
				composite(destination, x, y, fill)
			}
		}
	}
}

func polygon(destination *image.NRGBA, points []image.Point, fill color.NRGBA) {
	minimumY, maximumY := points[0].Y, points[0].Y
	for _, point := range points[1:] {
		minimumY = min(minimumY, point.Y)
		maximumY = max(maximumY, point.Y)
	}
	for y := minimumY; y <= maximumY; y++ {
		intersections := make([]int, 0, len(points))
		for index, first := range points {
			second := points[(index+1)%len(points)]
			if (first.Y <= y && second.Y > y) || (second.Y <= y && first.Y > y) {
				x := first.X + (y-first.Y)*(second.X-first.X)/(second.Y-first.Y)
				intersections = append(intersections, x)
			}
		}
		if len(intersections) == 2 {
			for x := min(intersections[0], intersections[1]); x <= max(intersections[0], intersections[1]); x++ {
				composite(destination, x, y, fill)
			}
		}
	}
}

func composite(destination *image.NRGBA, x, y int, fill color.NRGBA) {
	if !image.Pt(x, y).In(destination.Bounds()) {
		return
	}
	background := destination.NRGBAAt(x, y)
	alpha := float64(fill.A) / 255
	destination.SetNRGBA(x, y, color.NRGBA{
		R: uint8(float64(fill.R)*alpha + float64(background.R)*(1-alpha)),
		G: uint8(float64(fill.G)*alpha + float64(background.G)*(1-alpha)),
		B: uint8(float64(fill.B)*alpha + float64(background.B)*(1-alpha)),
		A: 255,
	})
}

func blend(first, second color.NRGBA, amount float64) color.NRGBA {
	return color.NRGBA{
		R: uint8(math.Round(float64(first.R)*(1-amount) + float64(second.R)*amount)),
		G: uint8(math.Round(float64(first.G)*(1-amount) + float64(second.G)*amount)),
		B: uint8(math.Round(float64(first.B)*(1-amount) + float64(second.B)*amount)),
		A: uint8(math.Round(float64(first.A)*(1-amount) + float64(second.A)*amount)),
	}
}

func nrgba(value color.Color) color.NRGBA {
	red, green, blue, alpha := value.RGBA()
	return color.NRGBA{R: uint8(red >> 8), G: uint8(green >> 8), B: uint8(blue >> 8), A: uint8(alpha >> 8)}
}

func withAlpha(value color.NRGBA, alpha uint8) color.NRGBA {
	value.A = alpha
	return value
}

func hex(value string) color.NRGBA {
	var red, green, blue uint8
	if _, err := fmt.Sscanf(value, "%02x%02x%02x", &red, &green, &blue); err != nil {
		return color.NRGBA{R: 244, G: 241, B: 234, A: 255}
	}
	return color.NRGBA{R: red, G: green, B: blue, A: 255}
}

func clamp(value, minimum, maximum int) int {
	return min(max(value, minimum), maximum)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
