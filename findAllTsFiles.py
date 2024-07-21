import os

def find_typescript_files(directory):
    typescript_files = []
    for root, _, files in os.walk(directory):
        if 'frontend/node_modules' in root:
            continue
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                typescript_files.append(os.path.join(root, file))
    return typescript_files

directory = '.'
typescript_files = find_typescript_files(directory)

for file in typescript_files:
    print(file)
