import os
import json

from setta.database.utils import create_new_id
from setta.utils import generate_memorable_string


def load_and_modify_json(file_path):
    print("filePath", file_path)
    try:
        # Load the JSON file
        with open(file_path, "r", encoding="utf-8") as f:
            json_data = json.load(f)

        for s in json_data["sectionVariants"].values():
            s["sweep"] = []

        for s in json_data['sections'].values():
            if s.get('paramSweepSectionId'):
                sweep_section = json_data['sections'][s['paramSweepSectionId']]
                sweep_section_variant_ids = sweep_section['variantIds']

                variantIds = []
                for idx, pid in enumerate(s['paramSweepIds']):
                    if idx < len(sweep_section_variant_ids):
                        json_data['sectionVariants'][sweep_section_variant_ids[idx]]['sweep'] = json_data['paramSweeps'][pid]['sweep']
                        variantIds.append(sweep_section_variant_ids[idx])
                    else:
                        new_variant = {
                            'id': create_new_id(),
                            'name': generate_memorable_string(),
                            'selectedItem': None,
                            'code': "",
                            'codeInfoColId': create_new_id(),
                            'keywordPositions': [],
                            'children': [],
                            'values': {},
                            'isFrozen': False,
                            'sweep': json_data['paramSweeps'][pid]['sweep']
                        }
                        json_data['sectionVariants'][new_variant["id"]] = new_variant
                        variantIds.append(new_variant["id"])
                sweep_section['variantIds'] = variantIds
                
            del s["paramSweepId"]
            del s["paramSweepIds"]
        
        del json_data["paramSweeps"]

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
