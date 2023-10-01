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
                "chainedFromId": s["chainedFromId"],
                "evColId": s["evColId"],
                "uiTypeId": s["uiTypeId"],
                "uiTypeColId": s["uiTypeColId"],
                "selectedItemId": s["selectedItemId"],
                "social": s["social"],
                "outputGroupId": s["outputGroupId"],
                "description": s["description"],
                "descriptionHeight": s["descriptionHeight"],
                "descriptionVisible": s["descriptionVisible"],
            }
            for s in sections.values()
        ]

        db.executemany(query, query_params)


def convert_size(x):
    return -1 if x == "auto" else x
