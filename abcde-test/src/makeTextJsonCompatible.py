import argparse


def main(path, out_path):
    with open(path, "r") as f:
        text = f.read()
    text = text.replace("\n", "\\n")
    text = text.replace('"', '\\"')
    with open(out_path, "w") as f:
        f.write(text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--path", type=str, required=True)
    parser.add_argument("--out_path", type=str, required=True)
    args = parser.parse_args()
    main(args.path, args.out_path)
