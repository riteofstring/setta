"""
Migration to add machine tracking columns to projects table.
Run this script to update your database schema for hibernation support.
"""

import sys
from pathlib import Path

# Add parent directory to path so we can import from backend
sys.path.append(str(Path(__file__).parent.parent))

# Now we can import from backend modules
from sqlalchemy import text

from database import engine


def add_machine_tracking_columns():
    """Add machine_id and machine_state columns to projects table."""
    with engine.connect() as conn:
        # Check if columns already exist
        result = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='projects'
                AND column_name IN ('machine_id', 'machine_state')
                """
            )
        )

        existing_columns = [row[0] for row in result]

        # Add machine_id column if it doesn't exist
        if "machine_id" not in existing_columns:
            print("Adding machine_id column...")
            conn.execute(text("ALTER TABLE projects ADD COLUMN machine_id VARCHAR(255)"))
            conn.commit()
            print("✓ machine_id column added")
        else:
            print("✓ machine_id column already exists")

        # Add machine_state column if it doesn't exist
        if "machine_state" not in existing_columns:
            print("Adding machine_state column...")
            conn.execute(
                text(
                    """
                    ALTER TABLE projects
                    ADD COLUMN machine_state VARCHAR(50) DEFAULT 'started'
                    """
                )
            )
            conn.commit()
            print("✓ machine_state column added")
        else:
            print("✓ machine_state column already exists")

        # Add index on machine_state for performance
        print("Adding index on machine_state...")
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_projects_machine_state
                ON projects(machine_state)
                """
            )
        )
        conn.commit()
        print("✓ Index added on machine_state")

        # Update any NULL machine_states to 'unknown' for existing projects
        print("Updating existing projects...")
        conn.execute(
            text(
                """
                UPDATE projects
                SET machine_state = 'unknown'
                WHERE machine_state IS NULL
                """
            )
        )
        conn.commit()

        print("✓ Migration completed successfully!")


def rollback():
    """Rollback the migration if needed."""
    with engine.connect() as conn:
        print("Rolling back migration...")

        # Drop index
        conn.execute(text("DROP INDEX IF EXISTS idx_projects_machine_state"))

        # Drop columns
        conn.execute(text("ALTER TABLE projects DROP COLUMN IF EXISTS machine_id"))
        conn.execute(text("ALTER TABLE projects DROP COLUMN IF EXISTS machine_state"))
        conn.commit()

        print("✓ Rollback completed")


def check_current_schema():
    """Display current schema for debugging."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'projects'
                ORDER BY ordinal_position
                """
            )
        )

        print("\nCurrent projects table schema:")
        print("-" * 80)
        for row in result:
            print(
                f"{row[0]:<20} {row[1]:<20} "
                f"{'NULL' if row[2] == 'YES' else 'NOT NULL':<10} "
                f"DEFAULT: {row[3] or 'None'}"
            )
        print("-" * 80)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        if sys.argv[1] == "rollback":
            rollback()
        elif sys.argv[1] == "check":
            check_current_schema()
    else:
        add_machine_tracking_columns()
        check_current_schema()
