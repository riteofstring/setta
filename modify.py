import os
import json
import uuid


def load_and_modify_json(file_path):
    print("filePath", file_path)
    try:
        # Load the JSON file
        with open(file_path, "r", encoding="utf-8") as f:
            json_data = json.load(f)

        json_data["codeInfoCols"] = {}
        for s in json_data["sections"].values():
            codeInfoColId = str(uuid.uuid4())
            json_data["codeInfoCols"][codeInfoColId] = {
                "id": codeInfoColId,
                "children": {None: []},
            }
            curr_children = json_data["codeInfoCols"][codeInfoColId]["children"]
            old_root = json_data["codeInfo"][s["codeInfoId"]]

            stack = list(curr_children.keys())
            while len(stack) > 0:
                id = stack.pop()
                if id is None:
                    new_children = [c for c in old_root["children"] if c!="callable"]
                else:
                    new_children = [c for c in json_data["codeInfo"][id]["children"]]
                curr_children[id] = new_children
                stack.extend(new_children)

            del s["codeInfoId"]

            for variantId in s["variantIds"]:
                json_data["sectionVariants"][variantId]["codeInfoColId"] = codeInfoColId

        for c in json_data["codeInfo"].values():
            del c["children"]

            

        # Save the modified JSON back to the file
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2)

        return json_data
    except Exception as error:
        print("Error processing JSON file:", error)
        raise


def get_json_files(directory, file_list=None):
    if file_list is None:
        file_list = []

    try:
        files = os.listdir(directory)

        for file in files:
            file_path = os.path.join(directory, file)
            if os.path.isdir(file_path):
                get_json_files(file_path, file_list)
            elif file.endswith(".json"):
                file_list.append(file_path)

        return file_list
    except Exception as error:
        print(f"Error accessing directory {directory}:", error)
        raise


# Usage
if __name__ == "__main__":
    json_files = get_json_files("seed")
    for json_file in json_files:
        if "Settings.json" in json_file:
            continue
        load_and_modify_json(json_file)
