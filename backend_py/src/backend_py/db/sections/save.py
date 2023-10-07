from ...schema import db


def save_sections(sections):
    with db:
        query = """
            INSERT OR REPLACE INTO Section (
                id,
                name,
                paramInfoId,
                width,
                height,
                chainedFromId,
                evColId,
                uiTypeId,
                uiTypeColId,
                selectedItemId,
                social,
                outputGroupId,
                description,
                descriptionHeight,
                descriptionVisible
            )
            VALUES (
                :id,
                :name,
                :paramInfoId,
                :width,
                :height,
                :chainedFromId,
                :evColId,
                :uiTypeId,
                :uiTypeColId,
                :selectedItemId,
                :social,
                :outputGroupId,
                :description,
                :descriptionHeight,
                :descriptionVisible
            )
        """

        query_params = [
            {
                "id": s["id"],
                "name": s["name"],
                "paramInfoId": s["paramInfoId"],
                "width": convert_size(s["size"]["width"]),
                "height": convert_size(s["size"]["height"]),
                "chainedFromId": s["chainedFrom"],
                "evColId": s["evColId"],
                "uiTypeId": s["uiTypeId"],
                "uiTypeColId": s["uiTypeColId"],
                "selectedItemId": s["selectedItem"],
                "social": s["social"],
                "outputGroupId": s["outputGroup"],
                "description": s["description"],
                "descriptionHeight": s["descriptionHeight"],
                "descriptionVisible": s["descriptionVisible"],
            }
            for s in sections.values()
        ]

        db.executemany(query, query_params)

        ids = [s["id"] for s in sections.values()]
        placeholders = ", ".join(["?"] * len(ids))
        query = f"""
            UPDATE UIType
            SET asNonPresetForSectionId = null
            WHERE asNonPresetForSectionId IN ({placeholders})
        """
        db.execute(query, ids)

        query = """
            UPDATE UIType
            SET asNonPresetForSectionId = :sectionId
            WHERE id = :uiTypeId
        """
        query_params = []
        for s in sections.values():
            for uiTypeId in s["nonPresetUITypeIds"]:
                query_params.append({"uiTypeId": uiTypeId, "sectionId": s["id"]})
        db.executemany(query, query_params)


def convert_size(x):
    return -1 if x == "auto" else x
