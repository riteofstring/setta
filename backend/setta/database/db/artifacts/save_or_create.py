import json

from setta.database.utils import create_new_id


def get_artifact_value_for_db(artifact, saveTo):
    if saveTo == "disk":
        return None
    return json.dumps(artifact["value"])


def save_or_create_artifacts(db, artifacts, saveTo):
    result_ids = [None] * len(artifacts)

    with_id = []
    without_id = []
    for i, art in enumerate(artifacts):
        if art["id"]:
            with_id.append((i, art))
        else:
            without_id.append((i, art))

    if without_id:
        query_params = []
        for i, art in without_id:
            query_params.extend([art["name"], art["path"], art["type"]])
        placeholders = ", ".join(["(?, ?, ?)"] * (len(query_params) // 3))
        query = f"""
            SELECT id, name, path, type
            FROM Artifact
            WHERE (name, path, type) IN ({placeholders})
        """

        db.execute(query, query_params)

        for row in db.fetchall():
            print("row", dict(row))

















    # # Upsert everything that already has an id in a single query
    # if with_id:
    #     values_clause = []
    #     params = []
    #     for i, art in with_id:
    #         values_clause.append("(?, ?, ?, ?, ?)")
    #         params.extend(
    #             {
    #                 art["id"],
    #                 art["name"],
    #                 art["path"],
    #                 get_artifact_value_for_db(art, saveTo),
    #                 art["type"],
    #             }
    #         )
    #     sql = f"""
    #         INSERT INTO Artifact (id, name, path, value, type)
    #         VALUES (:id, :name, :path, :value, :type)
    #         ON CONFLICT (id) DO UPDATE
    #         SET name=excluded.name,
    #             path=excluded.path,
    #             value=excluded.value,
    #             type=excluded.type
    #     """
    #     db.execute(sql, params)

    #     # Record the final IDs in the output array
    #     for i, art in with_id:
    #         result_ids[i] = art["id"]

    # # Handle those without an id:
    # # We need to check if there's an existing row by (name, path, type).
    # # 1) Gather unique (name, path, type) from these artifacts
    # lookup_map = {}  # (name, path, type) -> list of (index, artifact)
    # unique_keys = set()
    # for i, art in without_id:
    #     key = (art["name"], art["path"], art["type"])
    #     unique_keys.add(key)
    #     lookup_map.setdefault(key, []).append(i)

    # # 2) Fetch existing rows for these (name, path, type)
    # if unique_keys:
    #     # Build "WHERE (name, path, type) IN ..."
    #     # We'll do this with placeholders: (?,?,?), (?,?,?), ...
    #     # Because we have a variable number of keys.
    #     where_clause_parts = []
    #     params = []
    #     for n, p, t in unique_keys:
    #         where_clause_parts.append("(?, ?, ?)")
    #         params.extend([n, p, t])
    #     where_clause_parts = ", ".join(where_clause_parts)
    #     sql = f"""
    #         SELECT id, name, path, type
    #         FROM Artifact
    #         WHERE (name, path, type) IN ({where_clause_parts})
    #     """
    #     print("sql", sql, flush=True)

    #     db.execute(sql, params)
    #     existing_rows = db.fetchall()

    #     # 3) Map existing (name, path, type) -> id
    #     existing_map = {}
    #     for row in existing_rows:
    #         print("row in existing_rows", row, flush=True)
    #         key = (row["name"], row["path"], row["type"])
    #         existing_map[key] = row["id"]
    # else:
    #     existing_map = {}

    # # 4) Now, for each artifact without an id, either update the existing row
    # #    or create a new row with a new id in two bulk steps.

    # # Step 4A: Those that match existing row -> we'll collect them for a single update
    # update_list = []  # (name, path, value, type, existing_id)
    # update_map = {}  # index -> id

    # # Step 4B: Those that don't match -> we'll create new id and do a bulk insert
    # insert_list = []  # (new_id, name, path, value, type)
    # insert_map = {}  # index -> new_id

    # for i, art in without_id:
    #     key = (art["name"], art["path"], art["type"])
    #     if key in existing_map:
    #         matched_id = existing_map[key]
    #         update_list.append(
    #             (
    #                 art["name"],
    #                 art["path"],
    #                 get_artifact_value_for_db(art, saveTo),
    #                 art["type"],
    #                 matched_id,
    #             )
    #         )
    #         update_map[i] = matched_id
    #     else:
    #         new_id = create_new_id()  # assume this is defined elsewhere
    #         insert_list.append(
    #             (
    #                 new_id,
    #                 art["name"],
    #                 art["path"],
    #                 get_artifact_value_for_db(art, saveTo),
    #                 art["type"],
    #             )
    #         )
    #         insert_map[i] = new_id

    # # 5) Do a single multi-row UPDATE for those that matched
    # if update_list:
    #     # We'll do something like:
    #     # UPDATE Artifact
    #     #     SET name=?, path=?, value=?, type=?
    #     # WHERE id=?
    #     #
    #     # but we have to do one row at a time in SQLite unless
    #     # we set up a trick using CASE. For clarity, we'll do
    #     # one multi-statement approach. It's still fewer queries
    #     # than updating each artifact individually outside a transaction.
    #     #
    #     # If we really want one statement, we can build a giant CASE, but
    #     # that's usually more trouble than it's worth.
    #     for name, path, value, type_, row_id in update_list:
    #         db.execute(
    #             """
    #             UPDATE Artifact
    #             SET name=?, path=?, value=?, type=?
    #             WHERE id=?
    #         """,
    #             (name, path, value, type_, row_id),
    #         )

    # # 6) Do a single multi-row INSERT for those that didn't match
    # if insert_list:
    #     # Build multi-row insert statement
    #     values_clause = []
    #     params = []
    #     for aid, n, p, v, t in insert_list:
    #         values_clause.append("(?, ?, ?, ?, ?)")
    #         params.extend([aid, n, p, v, t])
    #     sql = f"""
    #         INSERT INTO Artifact (id, name, path, value, type)
    #         VALUES {", ".join(values_clause)}
    #     """
    #     db.execute(sql, params)

    # # Fill in result_ids for the ones without id
    # for i, art in without_id:
    #     if i in update_map:
    #         result_ids[i] = update_map[i]
    #     else:
    #         result_ids[i] = insert_map[i]

    # return result_ids
