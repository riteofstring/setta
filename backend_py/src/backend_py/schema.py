import sqlite3
from pathlib import Path

conn = sqlite3.connect((Path(__file__).parent / "dev.db").resolve())
cursor = conn.cursor()

commands = [
    # Session model
    """
    CREATE TABLE IF NOT EXISTS Session (
        id TEXT PRIMARY KEY,
        sid TEXT UNIQUE,
        data TEXT,
        expiresAt DATETIME
    );
    """,
    # CodeInfo model
    """
    CREATE TABLE IF NOT EXISTS CodeInfo (
        id TEXT PRIMARY KEY,
        name TEXT,
        editable BOOLEAN,
        rcType TEXT,
        defaultVal TEXT
    );
    """,
    # CodeInfoCol model
    """
    CREATE TABLE IF NOT EXISTS CodeInfoCol (
        parentId TEXT,
        childId TEXT,
        "order" INTEGER,
        PRIMARY KEY (parentId, childId),
        FOREIGN KEY (parentId) REFERENCES CodeInfo(id),
        FOREIGN KEY (childId) REFERENCES CodeInfo(id)
    );
    """,
    # User model
    """
    CREATE TABLE IF NOT EXISTS User (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        password BLOB,
        salt BLOB,
        darkMode BOOLEAN DEFAULT 0
    );
    """,
    # Section model
    """
    CREATE TABLE IF NOT EXISTS Section (
        id TEXT PRIMARY KEY,
        name TEXT,
        paramInfoId TEXT,
        width INTEGER,
        height INTEGER,
        chainedFromId TEXT,
        evColId TEXT,
        selectedItemId TEXT,
        uiTypeId TEXT,
        uiTypeColId TEXT,
        social TEXT,
        outputGroupId TEXT,
        description TEXT,
        descriptionHeight REAL,
        descriptionVisible BOOLEAN,
        asChildId TEXT,
        FOREIGN KEY (paramInfoId) REFERENCES CodeInfo(id),
        FOREIGN KEY (chainedFromId) REFERENCES Section(id),
        FOREIGN KEY (evColId) REFERENCES EVColId(id),
        FOREIGN KEY (selectedItemId) REFERENCES CodeInfo(id),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id),
        FOREIGN KEY (uiTypeColId) REFERENCES UITypeColId(id),
        FOREIGN KEY (outputGroupId) REFERENCES OutputGroup(id),
        FOREIGN KEY (asChildId) REFERENCES SectionChildren(childId)
    );
    """,
    # SectionChildren model
    """
    CREATE TABLE IF NOT EXISTS SectionChildren (
        childId TEXT PRIMARY KEY,
        parentId TEXT,
        "order" INTEGER,
        FOREIGN KEY (childId) REFERENCES Section(id),
        FOREIGN KEY (parentId) REFERENCES Section(id)
    );
    """,
    # EVColId model
    """
    CREATE TABLE IF NOT EXISTS EVColId (
        id TEXT PRIMARY KEY
    );
    """,
    # EVCol model
    """
    CREATE TABLE IF NOT EXISTS EVCol (
        idid TEXT,
        codeInfoId TEXT,
        value TEXT,
        PRIMARY KEY (idid, codeInfoId),
        FOREIGN KEY (idid) REFERENCES EVColId(id),
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id)
    );
    """,
    # UIType model
    """
    CREATE TABLE IF NOT EXISTS UIType (
        id TEXT PRIMARY KEY,
        name TEXT,
        ownerId TEXT,
        type TEXT,
        presetType TEXT,
        sectionConfigChildUITypeId TEXT UNIQUE,
        sectionConfigSubType TEXT,
        sliderConfigMin REAL,
        sliderConfigMax REAL,
        sliderConfigStep REAL,
        asNonPresetForSectionId TEXT,
        asNonPresetForUITypeColId TEXT,
        asNonPresetForCodeInfoId TEXT,
        FOREIGN KEY (ownerId) REFERENCES User(id),
        FOREIGN KEY (sectionConfigChildUITypeId) REFERENCES UIType(id),
        FOREIGN KEY (asNonPresetForSectionId) REFERENCES Section(id),
        FOREIGN KEY (asNonPresetForUITypeColId) REFERENCES UITypeCol(idid),
        FOREIGN KEY (asNonPresetForCodeInfoId) REFERENCES UITypeCol(codeInfoId)
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
        FOREIGN KEY (idid) REFERENCES UITypeColId(id),
        FOREIGN KEY (codeInfoId) REFERENCES CodeInfo(id),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id)
    );
    """,
    # Project model
    """
    CREATE TABLE IF NOT EXISTS Project (
        id TEXT PRIMARY KEY,
        name TEXT,
        ownerId TEXT,
        defaultConfigId TEXT UNIQUE,
        UNIQUE (name, ownerId),
        FOREIGN KEY (ownerId) REFERENCES User(id),
        FOREIGN KEY (defaultConfigId) REFERENCES ProjectConfig(id)
    );
    """,
    # ProjectConfig model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfig (
        id TEXT PRIMARY KEY,
        name TEXT,
        projectId TEXT,
        x REAL DEFAULT 0,
        y REAL DEFAULT 0,
        zoom REAL DEFAULT 1,
        UNIQUE (name, projectId),
        FOREIGN KEY (projectId) REFERENCES Project(id)
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
        FOREIGN KEY (parentId) REFERENCES ProjectConfig(id),
        FOREIGN KEY (childId) REFERENCES Section(id)
    );
    """,
    # UserCodeInfoTypeMap model
    """
    CREATE TABLE IF NOT EXISTS UserCodeInfoTypeMap (
        ownerId TEXT,
        type TEXT,
        uiTypeId TEXT,
        PRIMARY KEY (ownerId, type),
        FOREIGN KEY (ownerId) REFERENCES User(id),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id)
    );
    """,
    # ProjectConfigCodeInfoTypeMap model
    """
    CREATE TABLE IF NOT EXISTS ProjectConfigCodeInfoTypeMap (
        projectConfigId TEXT,
        type TEXT,
        uiTypeId TEXT,
        PRIMARY KEY (projectConfigId, type),
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id),
        FOREIGN KEY (uiTypeId) REFERENCES UIType(id)
    );
    """,
    # Run model
    """
    CREATE TABLE IF NOT EXISTS Run (
        id TEXT PRIMARY KEY,
        name TEXT,
        ownerId TEXT,
        projectConfigId TEXT,
        code TEXT,
        FOREIGN KEY (ownerId) REFERENCES User(id),
        FOREIGN KEY (projectConfigId) REFERENCES ProjectConfig(id)
    );
    """,
    # OutputGroup model
    """
    CREATE TABLE IF NOT EXISTS OutputGroup (
        id TEXT PRIMARY KEY,
        name TEXT,
        runId TEXT,
        UNIQUE (name, runId),
        FOREIGN KEY (runId) REFERENCES Run(id)
    );
    """,
    # Output model
    """
    CREATE TABLE IF NOT EXISTS Output (
        id TEXT PRIMARY KEY,
        name TEXT,
        "values" REAL,
        outputGroupId TEXT,
        FOREIGN KEY (outputGroupId) REFERENCES OutputGroup(id)
    );
    """,
]


for com in commands:
    print(com)
    cursor.execute(com)

conn.commit()
