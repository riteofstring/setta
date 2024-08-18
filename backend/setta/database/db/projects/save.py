from collections import defaultdict

from setta.code_gen.export_selected import (
    get_section_type,
    get_section_variants,
    get_selected_item_name,
    get_selected_section_variant,
)
from setta.database.utils import create_new_id, generate_memorable_string
from setta.utils.constants import C

from ..codeInfo.save import save_code_info
from ..paramSweeps.save import save_param_sweeps
from ..runGroups.save import save_run_groups
from ..sections.save import save_sections
from ..sectionVariants.save import save_section_variants
from ..uiTypes.save import save_ui_type_cols, save_ui_types


def save_project_details(dbs, p):
    save_section_variants(dbs, p["sectionVariants"])
    save_code_info(dbs, p["codeInfo"])
    save_ui_types(dbs, p["uiTypes"])
    save_ui_type_cols(dbs, p["uiTypeCols"])
    save_param_sweeps(dbs, p["paramSweeps"])
    save_sections(dbs, p["sections"])
    save_project(dbs, p["projectConfig"])
    save_section_configs(dbs, p["projectConfig"]["id"], p["sections"])
    update_linked_project_configs(dbs, p)
    save_run_groups(dbs, p["runGroups"])


def save_project(dbs, project):
    db = dbs.default
    query = """
        INSERT INTO ProjectConfig (id, name, previewImgNodes, isDefault, x, y, zoom)
        VALUES (:id, :name, :previewImgNodes, :isDefault, :x, :y, :zoom)
        ON CONFLICT (id)
        DO UPDATE SET
        name = :name,
        previewImgNodes = :previewImgNodes,
        isDefault = :isDefault,
        x = :x,
        y = :y,
        zoom = :zoom
    """

    query_params = {
        "id": project["id"],
        "name": project["name"],
        "previewImgNodes": project["previewImgNodes"],
        "isDefault": project["isDefault"],
        **project["viewport"],
    }
    db.execute(query, query_params)

    if "previewImgColor" in project:
        query = """
            UPDATE ProjectConfig
            SET previewImgColor = :previewImgColor
            WHERE ID = :id
        """
        db.execute(
            query, {"id": project["id"], "previewImgColor": project["previewImgColor"]}
        )

    query = """
        DELETE FROM ProjectConfigChildren
        WHERE parentId = :parentId
    """
    db.execute(query, {"parentId": project["id"]})

    query = """
        INSERT INTO ProjectConfigChildren (parentId, childId, x, y, zIndex)
        VALUES (:parentId, :childId, :x, :y, :zIndex)
    """
    query_params = []
    query_params.extend(
        [
            {
                "parentId": project["id"],
                "childId": childId,
                "x": details["x"],
                "y": details["y"],
                "zIndex": details["zIndex"],
            }
            for childId, details in project["children"].items()
        ]
    )
    db.executemany(query, query_params)


def create_project_config(dbs, name, previewImgColor):
    db = dbs.default
    query = """
        SELECT name
        FROM ProjectConfig
    """
    db.execute(query)
    taken_names = [row[0] for row in db.fetchall()]

    while (not name) or name in taken_names:
        name = generate_memorable_string()

    query = """
        INSERT INTO ProjectConfig (id, name, previewImgColor)
        VALUES (:id, :name, :previewImgColor)
    """
    projectId = create_new_id()
    query_params = {"id": projectId, "name": name, "previewImgColor": previewImgColor}
    db.execute(query, query_params)

    query = """
        SELECT
            name
        FROM
            ProjectConfig
        WHERE
            id = :id
    """
    query_params = {"id": projectId}
    db.execute(query, query_params)
    out = dict(db.fetchone())
    return out["name"]


def save_project_config_name(dbs, curr_name, new_name):
    db = dbs.default
    query = """
        UPDATE ProjectConfig
        SET name = :new_name
        WHERE name = :curr_name
    """
    query_params = {"curr_name": curr_name, "new_name": new_name}
    db.execute(query, query_params)


def save_section_configs(dbs, project_config_id, sections):
    db = dbs.default

    query_params = []
    for section_id in sections.keys():
        query_params.extend([project_config_id, section_id])
    placeholders = ", ".join(["(?, ?)"] * (len(query_params) // 2))
    query = f"""
        DELETE FROM SectionConfig
        WHERE (projectConfigId, sectionId) IN ({placeholders})
    """
    db.execute(query, query_params)

    id_pairs = [(project_config_id, s) for s in sections.keys()]
    insert_section_configs(dbs, sections, id_pairs)


def insert_section_configs(dbs, sections, id_pairs):
    db = dbs.default
    query = """
        INSERT INTO SectionConfig (projectConfigId, sectionId, width, height, variantId, paramSweepId, isHorizontalOrientation)
        VALUES (:projectConfigId, :sectionId, :width, :height, :variantId, :paramSweepId, :isHorizontalOrientation)
    """

    query_params = [
        {
            "projectConfigId": projectConfigId,
            "sectionId": sections[c]["id"],
            "width": convert_size(sections[c]["size"]["width"]),
            "height": convert_size(sections[c]["size"]["height"]),
            "variantId": sections[c]["variantId"],
            "paramSweepId": sections[c]["paramSweepId"],
            "isHorizontalOrientation": sections[c]["isHorizontalOrientation"],
        }
        for projectConfigId, c in id_pairs
    ]

    db.executemany(query, query_params)


# If multiple project configs share a section,
# and that section has children,
# then if a new child is added in one of those project configs,
# an entry in SectionConfig needs to be added for ALL project configs.
# Otherwise when loading those other project configs,
# the data for the new child will be missing.
def update_linked_project_configs(dbs, project):
    db = dbs.default
    query = """
        SELECT projectConfigId, sectionId
        FROM SectionConfig
        WHERE projectConfigId != ?
    """
    project_config = project["projectConfig"]
    db.execute(query, (project_config["id"],))
    sections_to_project_configs = defaultdict(set)
    project_configs_to_sections = defaultdict(set)
    for row in db.fetchall():
        row = dict(row)
        sections_to_project_configs[row["sectionId"]].add(row["projectConfigId"])
        project_configs_to_sections[row["projectConfigId"]].add(row["sectionId"])

    section_configs_to_add = set()
    children_have_been_visited = set()
    has_been_visited_as_child = set()
    # we start with top level sections that are also in other project configs
    ids = set(
        k for k in project_config["children"].keys() if k in sections_to_project_configs
    )
    while len(ids) > 0:
        curr = ids.pop()
        if curr in children_have_been_visited:
            continue
        children_have_been_visited.add(curr)
        for variant in get_section_variants(project, curr):
            children = variant["children"]
            for c in children:
                if c in has_been_visited_as_child:
                    continue
                has_been_visited_as_child.add(c)
                c_already_in_at_least_one_other_config = False
                for other_project_config in sections_to_project_configs[curr]:
                    other_project_section_configs = project_configs_to_sections[
                        other_project_config
                    ]
                    # The parent (curr) is in other project configs, but the child is not.
                    # So we need to add the child to the other project configs that it's not in.
                    if c not in other_project_section_configs:
                        section_configs_to_add.add((other_project_config, c))
                        missing_referenced_section_id = (
                            get_missing_referenced_section_id(
                                project, c, other_project_section_configs
                            )
                        )
                        if missing_referenced_section_id:
                            section_configs_to_add.add(
                                (other_project_config, missing_referenced_section_id)
                            )

                    else:
                        c_already_in_at_least_one_other_config = True

                # The child is already in at least one other project config.
                # So we need to recurse into the child, to see if its children
                # need to be added.
                if (
                    c_already_in_at_least_one_other_config
                    and c not in children_have_been_visited
                ):
                    ids.add(c)

    print("section_configs_to_add", section_configs_to_add, flush=True)
    insert_section_configs(dbs, project["sections"], section_configs_to_add)


def convert_size(x):
    return -1 if x == "auto" else x


def get_missing_referenced_section_id(
    project, section_id, other_project_section_configs
):
    if get_section_type(project, section_id) == C.REFERENCE_SECTION:
        r = project["fullNameToInfo"][get_selected_item_name(project, section_id)]
        if (
            r["sectionId"]
            and not r["paramInfoId"]
            and not r["isArgsObj"]
            and r["sectionId"] not in other_project_section_configs
        ):
            return r["sectionId"]
    return None
