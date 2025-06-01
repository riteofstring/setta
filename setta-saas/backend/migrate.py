# backend/migrate.py
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def add_last_checked_column():
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN last_checked TIMESTAMP"))
            conn.commit()
        print("✓ Added last_checked column")
    except Exception as e:
        print(f"Error or already exists: {e}")

if __name__ == "__main__":
    add_last_checked_column()
