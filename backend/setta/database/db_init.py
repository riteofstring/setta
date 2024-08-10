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
        isSelected BOOLEAN
    );
    """,
    # CodeInfoCol model
    """
    CREATE TABLE IF NOT EXISTS CodeInfoCol (
        parentId TEXT,
        childId TEXT,
        "order" INTEGER,
        PRIMARY KEY (parentId, childId),
        FOREIGN KEY (parentId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (childId) REFERENCES CodeInfo(id) ON DELETE CASCADE
    );
    """,
    # Section model
    """
    CREATE TABLE IF NOT EXISTS Section (
        id TEXT PRIMARY KEY,
        name TEXT,
        width INTEGER,
        height INTEGER,
        evColId TEXT,
        paramSweepId TEXT,
        paramSweepSectionId TEXT,
        selectedItemId TEXT,
        uiTypeId TEXT,
        uiTypeColId TEXT,
        social TEXT,
        outputGroupId TEXT,
        description TEXT,
        versionsHeight REAL,
        versionsVisible BOOLEAN,
        code TEXT,
        codeLanguage TEXT,
        isFrozen BOOLEAN,
        dbSource TEXT,
        FOREIGN KEY (evColId) REFERENCES EVColId(id) ON DELETE CASCADE,
        FOREIGN KEY (paramSweepId) REFERENCES ParamSweepId(id) ON DELETE CASCADE,
        FOREIGN KEY (paramSweepSectionId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (selectedItemId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id) ON DELETE CASCADE,
        FOREIGN KEY (uiTypeColId) REFERENCES UITypeColId(id) ON DELETE CASCADE,
        FOREIGN KEY (outputGroupId) REFERENCES OutputGroup(id) ON DELETE CASCADE
    );
    """,
    # SectionChildren model
    """
    CREATE TABLE IF NOT EXISTS SectionChildren (
        childId TEXT PRIMARY KEY,
        parentId TEXT,
        "order" INTEGER,
        FOREIGN KEY (childId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (parentId) REFERENCES Section(id) ON DELETE CASCADE
    );
    """,
    # EVColId model
    """
    CREATE TABLE IF NOT EXISTS EVColId (
        id TEXT PRIMARY KEY,
        name TEXT,
        originSectionId TEXT,
        FOREIGN KEY (originSectionId) REFERENCES Section(id) ON DELETE CASCADE
    );
    """,
    # EVCol model
    """
    CREATE TABLE IF NOT EXISTS EVCol (
        idid TEXT,
        codeInfoId TEXT,
        value TEXT,
        PRIMARY KEY (idid, codeInfoId),
        FOREIGN KEY (idid) REFERENCES EVColId(id) ON DELETE CASCADE,
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE
    );
    """,
    # UIType model
    """
    CREATE TABLE IF NOT EXISTS UIType (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        presetType TEXT,
        sectionConfigCodeInfoId TEXT,
        sectionConfigChildUITypeId TEXT UNIQUE,
        sectionConfigSubType TEXT,
        sliderConfigMin REAL,
        sliderConfigMax REAL,
        sliderConfigStep REAL,
        asNonPresetForSectionId TEXT,
        asNonPresetForUITypeColId TEXT,
        asNonPresetForCodeInfoId TEXT,
        FOREIGN KEY (sectionConfigCodeInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (sectionConfigChildUITypeId) REFERENCES UIType(id) ON DELETE CASCADE,
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
        x REAL DEFAULT 0,
        y REAL DEFAULT 0,
        zoom REAL DEFAULT 1,
        isDefault BOOLEAN DEFAULT 0,
        previewImgNodes TEXT DEFAULT '[]',
        previewImgColor TEXT,
        UNIQUE (name)
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
    # Run model
    """
    CREATE TABLE IF NOT EXISTS Run (
        id TEXT PRIMARY KEY,
        name TEXT,
        projectConfigId TEXT,
        code TEXT,
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE
    );
    """,
    # OutputGroup model
    """
    CREATE TABLE IF NOT EXISTS OutputGroup (
        id TEXT PRIMARY KEY,
        name TEXT,
        runId TEXT,
        UNIQUE (name, runId),
        FOREIGN KEY (runId) REFERENCES Run(id) ON DELETE CASCADE
    );
    """,
    # Output model
    """
    CREATE TABLE IF NOT EXISTS Output (
        id TEXT PRIMARY KEY,
        name TEXT,
        "values" REAL,
        outputGroupId TEXT,
        FOREIGN KEY (outputGroupId) REFERENCES OutputGroup(id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS RunGroupId (
        id TEXT PRIMARY KEY,
        name TEXT,
        projectConfigId TEXT,
        "order" INTEGER,
        selected BOOLEAN,
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id) ON DELETE CASCADE
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS RunGroup (
        idid TEXT,
        sectionId TEXT,
        paramSweepId TEXT,
        PRIMARY KEY (idid, sectionId, paramSweepId),
        FOREIGN KEY (idid) REFERENCES RunGroupId(id) ON DELETE CASCADE,
        FOREIGN KEY (sectionId) REFERENCES Section(id) ON DELETE CASCADE,
        FOREIGN KEY (paramSweepId) REFERENCES ParamSweepId(id) ON DELETE CASCADE
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
        paramInfoId TEXT,
        evColId TEXT,
        "order" INTEGER,
        value TEXT,
        PRIMARY KEY (idid, paramInfoId, evColId),
        FOREIGN KEY (idid) REFERENCES ParamSweepId(id) ON DELETE CASCADE,
        FOREIGN KEY (paramInfoId) REFERENCES CodeInfo(id) ON DELETE CASCADE,
        FOREIGN KEY (evColId) REFERENCES EVColId(id) ON DELETE CASCADE,
        CHECK (paramInfoId IS NOT NULL OR evColId IS NOT NULL)
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


def maybe_create_tables_and_seed(dbs, with_examples=False, with_base_ui_types=True):
    dbs.connect()
    with dbs:
        for db in dbs.values():
            if not tables_exist(db):
                create_tables(db)
        do_seed_examples = with_examples and not seed_data_exist(
            dbs.default, ["UIType"]
        )
        do_seed_base_ui_types = with_base_ui_types and not seed_data_exist(
            dbs.default, ["UIType"]
        )
        seed(
            dbs,
            with_examples=do_seed_examples,
            with_base_ui_types=do_seed_base_ui_types,
        )
    dbs.disconnect()
