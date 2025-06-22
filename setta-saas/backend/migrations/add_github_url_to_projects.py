"""
Migration to add github_url to projects table.
Run this script to update your database schema for code deployment.
"""

import sys
from pathlib import Path

# Add parent directory to path so we can import from backend
sys.path.append(str(Path(__file__).parent.parent))

# Now we can import from backend modules
from sqlalchemy import text

from database import engine


def add_github_url_column():
    """Add github_url column to projects table."""
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='projects' AND column_name='github_url'
                """
            )
        )

        if result.rowcount > 0:
            print("✓ github_url column already exists")
            return

        # Add the column (nullable for existing projects)
        print("Adding github_url column...")
        conn.execute(text("ALTER TABLE projects ADD COLUMN github_url VARCHAR(500)"))
        conn.commit()

        print("✓ github_url column added")

        # Add index for performance
        print("Adding index on github_url...")
        conn.execute(text("CREATE INDEX idx_projects_github_url ON projects(github_url)"))
        conn.commit()

        print("✓ Migration completed successfully!")


def rollback():
    """Rollback the migration if needed."""
    with engine.connect() as conn:
        print("Rolling back migration...")

        # Drop index
        conn.execute(text("DROP INDEX IF EXISTS idx_projects_github_url"))

        # Drop column
        conn.execute(text("ALTER TABLE projects DROP COLUMN IF EXISTS github_url"))
        conn.commit()

        print("✓ Rollback completed")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        add_github_url_column()
