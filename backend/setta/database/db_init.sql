-- TABLES --
CREATE TABLE IF NOT EXISTS ProjectState (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT
);
CREATE TABLE IF NOT EXISTS Artifact (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '',
    value TEXT,
    type TEXT NOT NULL,
    UNIQUE (name, path, type)
);
CREATE TABLE IF NOT EXISTS Notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projectConfigId TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f%z', 'now')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSON,
  read_status BOOLEAN NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS Chat (
    id TEXT PRIMARY KEY,
    name TEXT,
    lastUpdated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f%z', 'now'))
);
CREATE TABLE IF NOT EXISTS ChatMessage (
    id TEXT PRIMARY KEY,
    chatId TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    FOREIGN KEY (chatId) REFERENCES Chat(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS UUIDMappingForLLM (
    id INTEGER PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL
);


-- TRIGGERS --
CREATE TRIGGER IF NOT EXISTS update_chat_session_timestamp
AFTER INSERT ON ChatMessage
BEGIN
    UPDATE Chat
    SET lastUpdated = strftime('%Y-%m-%dT%H:%M:%f%z', 'now')
    WHERE id = NEW.chatId;
END;