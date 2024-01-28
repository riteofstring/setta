def create_resizable_css(filename):
    with open(filename, 'w') as css_file:
        # Iterate for widths from 100 to 2000
        for width in range(100, 2001):
            css_file.write(f".resizable-width-{width} {{ width: {width}px; }}\n")

        # Iterate for heights from 100 to 2000
        for height in range(100, 2001):
            css_file.write(f".resizable-height-{height} {{ height: {height}px; }}\n")

# Call the function with the desired filename
create_resizable_css("resizable.css")
