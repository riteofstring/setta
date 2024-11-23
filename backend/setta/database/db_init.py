import re

from .seed import seed

CREATE_TABLES_COMMANDS = [
    # CodeInfo model
    """
    CREATE TABLE IF NOT EXISTS CodeInfo (
        id TEXT PRIMARY KEY,
        name TEXT,
        editable BOOLEAN,
        rcType TEXT,
        defaultVal TEXT,
        description TEXT,
        positionalOnly BOOLEAN,
        isPinned BOOLEAN,
        isFrozen BOOLEAN,
        keywordPositions TEXT
    );
    """,
    # CodeInfoColId model
    """
    CREATE TABLE IF NOT EXISTS CodeInfoColId (
        id TEXT,
        PRIMARY KEY (id)
    );
    """,
    # CodeInfoCol model
    """
    CREATE TABLE IF NOT EXISTS CodeInfoCol (
        idid TEXT,
        parentId TEXT,
        childId TEXT,
        "order" INTEGER,
        PRIMARY KEY (idid, parentId, childId),
        FOREIGN KEY (idid) REFERENCES CodeInfoColId(id) ON DELETE CASCADE,
        FOREIGN KEY (parentId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (childId) REFERENCES CodeInfo(id) ON DELETE CASCADE
    );
    """,
    # Section model
    """
    CREATE TABLE IF NOT EXISTS Section (
        id TEXT PRIMARY KEY,
        name TEXT,
        paramSweepSectionId TEXT,
        uiTypeId TEXT,
        uiTypeColId TEXT,
        social TEXT,
        description TEXT,
        codeLanguage TEXT,
        configLanguage TEXT,
        isFrozen BOOLEAN,
        jsonSource TEXT,
        hideUnpinnedParams BOOLEAN,
        displayMode TEXT,
        canvasSettings TEXT,
        renderMarkdown BOOLEAN,
        FOREIGN KEY (paramSweepSectionId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE,
        FOREIGN KEY (uiTypeColId) REFERENCES UITypeColId(id) ON DELETE CASCADE
    );
    """,
    # SectionConfig model
    """
    CREATE TABLE IF NOT EXISTS SectionConfig (
        projectConfigId TEXT,
        sectionId TEXT,
        width INTEGER,
        height INTEGER,
        variantId TEXT,
        paramSweepId TEXT,
        isHorizontalOrientation BOOLEAN,
        pinnedAreaHeight INTEGER,
        isMinimized BOOLEAN,
        PRIMARY KEY (projectConfigId, sectionId),
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
        FOREIGN KEY (sectionId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (paramSweepId) REFERENCES ParamSweepId(id) ON DELETE CASCADE,
        FOREIGN KEY (variantId) REFERENCES SectionVariantId(id) ON DELETE CASCADE
    );
    """,
    # SectionVariantId model
    """
    CREATE TABLE IF NOT EXISTS SectionVariantId (
        id TEXT PRIMARY KEY,
        name TEXT,
        selectedItem TEXT,
        code TEXT,
        keywordPositions TEXT,
        codeInfoColId TEXT,
        originSectionId TEXT,
        isFrozen BOOLEAN,
        isDefault BOOLEAN,
        FOREIGN KEY (selectedItem) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (originSectionId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (codeInfoColId) REFERENCES CodeInfoColId(id) ON DELETE CASCADE
    );
    """,
    # SectionVariantEV model
    """
    CREATE TABLE IF NOT EXISTS SectionVariantEV (
        idid TEXT,
        codeInfoId TEXT,
        value TEXT,
        keywordPositions TEXT,
        PRIMARY KEY (idid, codeInfoId),
        FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
    );
    """,
    # SectionVariantChildren model
    """
    CREATE TABLE IF NOT EXISTS SectionVariantChildren (
        idid TEXT,
        childId TEXT,
        "order" INTEGER,
        PRIMARY KEY (idid, childId),
        FOREIGN KEY (idid) REFERENCES SectionVariantId(id) ON DELETE CASCADE,
        FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE
    );
    """,
    # UIType model
    """
    CREATE TABLE IF NOT EXISTS UIType (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        presetType TEXT,
        sliderConfigMin REAL,
        sliderConfigMax REAL,
        sliderConfigStep REAL,
        asNonPresetForSectionId TEXT,
        asNonPresetForUITypeColId TEXT,
        asNonPresetForCodeInfoId TEXT,
        FOREIGN KEY (asNonPresetForSectionId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (asNonPresetForUITypeColId, asNonPresetForCodeInfoId) REFERENCES UITypeCol(idid, codeInfoId) ON DELETE CASCADE
    );
    """,
    # UITypeColId model
    """
    CREATE TABLE IF NOT EXISTS UITypeColId (
        id TEXT PRIMARY KEY
    );
    """,
    # UITypeCol model
    """
    CREATE TABLE IF NOT EXISTS UITypeCol (
        idid TEXT,
        codeInfoId TEXT,
        uiTypeId TEXT,
        PRIMARY KEY (idid, codeInfoId),
        FOREIGN KEY (idid) REFERENCES UITypeColId(id) ON DELETE CASCADE,
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE
    );
    """,
    # ProjectConfig model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfig (
        id TEXT PRIMARY KEY,
        name TEXT,
        viewport TEXT,
        isDefault BOOLEAN DEFAULT 0,
        previewImgNodes TEXT DEFAULT '[]',
        previewImgColor TEXT,
        shownRunGroup TEXT,
        UNIQUE (name),
        FOREIGN KEY (shownRunGroup) REFERENCES RunGroup(id) ON DELETE CASCADE
    );
    """,
    # ProjectConfigChildren model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfigChildren (
        parentId TEXT,
        childId TEXT,
        x REAL DEFAULT 0,
        y REAL DEFAULT 0,
        zIndex REAL DEFAULT 0,
        PRIMARY KEY (parentId, childId),
        FOREIGN KEY (parentId) REFERENCES ProjectConfig(id) ON DELETE CASCADE,
        FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE
    );
    """,
    # SectionArtifacts model
    """
    CREATE TABLE IF NOT EXISTS SectionArtifacts (
        sectionId TEXT,
        artifactPath TEXT,
        value TEXT,
        type TEXT,
        displayName TEXT,
        PRIMARY KEY (sectionId, artifactPath),
        FOREIGN KEY (sectionId) REFERENCES Section(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS RunGroup (
        id TEXT PRIMARY KEY,
        jsonRepr TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ProjectConfigRunGroup (
        projectConfigId TEXT KEY,
        runGroupId TEXT KEY,
        selected BOOLEAN,
        "order" INTEGER,
        PRIMARY KEY (projectConfigId, runGroupId),
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id),
        FOREIGN KEY (runGroupId) REFERENCES RunGroup(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ParamSweepId (
        id TEXT PRIMARY KEY,
        name TEXT,
        originSectionId TEXT,
        FOREIGN KEY (originSectionId) REFERENCES Section(id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS ParamSweep (
        idid TEXT,
        selectedItemGroupNum INTEGER,
        paramInfoGroupNum INTEGER,
        selectedItem TEXT,
        paramInfoId TEXT,
        "order" INTEGER,
        value TEXT,
        PRIMARY KEY (idid, "order"),
        FOREIGN KEY (idid) REFERENCES ParamSweepId(id) ON DELETE CASCADE,
        FOREIGN KEY (selectedItem) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (paramInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
    );
    """,
]


def create_tables(db):
    for com in CREATE_TABLES_COMMANDS:
        db.execute(com)


TABLE_NAMES = set(
    [
        re.search(r"CREATE TABLE IF NOT EXISTS (\S+) \(", x).group(1)
        for x in CREATE_TABLES_COMMANDS
    ]
)


def tables_exist(db):
    db.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = db.fetchall()
    existing_tables = {table[0] for table in tables}
    return TABLE_NAMES.issubset(existing_tables)


def seed_data_exist(db, tablenames):
    if not all(table in TABLE_NAMES for table in tablenames):
        raise ValueError("Invalid table name")

    for table in tablenames:
        db.execute(f"SELECT COUNT(*) FROM {table};")
        count = db.fetchone()[0]
        if count == 0:
            return False
    return True


def maybe_create_tables_and_seed(dbq, with_examples=False, with_base_ui_types=True):
    dbq.connect()
    with dbq as db:
        if not tables_exist(db):
            create_tables(db)
        do_seed_examples = with_examples and not seed_data_exist(db, ["UIType"])
        do_seed_base_ui_types = with_base_ui_types and not seed_data_exist(
            db, ["UIType"]
        )
        seed(
            db,
            with_examples=do_seed_examples,
            with_base_ui_types=do_seed_base_ui_types,
        )
    dbq.disconnect()
