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