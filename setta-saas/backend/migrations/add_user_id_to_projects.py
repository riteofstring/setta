"""
Migration to add user_id to projects table.
Run this script to update your database schema.
"""

import sys
from pathlib import Path

# Add parent directory to path so we can import from backend
sys.path.append(str(Path(__file__).parent.parent))

# Now we can import from backend modules
from sqlalchemy import text

from database import engine


def add_user_id_column():
    """Add user_id column to projects table."""
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='projects' AND column_name='user_id'
                """
            )
        )

        if result.rowcount > 0:
            print("✓ user_id column already exists")
            return

        # Add the column (nullable first)
        print("Adding user_id column...")
        conn.execute(text("ALTER TABLE projects ADD COLUMN user_id VARCHAR(255)"))
        conn.commit()

        # Set a default value for existing projects
        print("Setting default user_id for existing projects...")
        conn.execute(text("UPDATE projects SET user_id = 'pre-auth-user' WHERE user_id IS NULL"))
        conn.commit()

        # Make it NOT NULL
        print("Making user_id NOT NULL...")
        conn.execute(text("ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL"))
        conn.commit()

        # Add index for performance
        print("Adding index on user_id...")
        conn.execute(text("CREATE INDEX idx_projects_user_id ON projects(user_id)"))
        conn.commit()

        print("✓ Migration completed successfully!")


def rollback():
    """Rollback the migration if needed."""
    with engine.connect() as conn:
        print("Rolling back migration...")

        # Drop index
        conn.execute(text("DROP INDEX IF EXISTS idx_projects_user_id"))

        # Drop column
        conn.execute(text("ALTER TABLE projects DROP COLUMN IF EXISTS user_id"))
        conn.commit()

        print("✓ Rollback completed")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        add_user_id_column()
