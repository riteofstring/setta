"""
Database models and connection setup.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from config import get_settings

# Get database URL from settings
settings = get_settings()
SQLALCHEMY_DATABASE_URL = settings.database_url

# Create engine
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


class Project(Base):
    """Project model for storing user projects."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    status = Column(String, default="creating")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_checked = Column(DateTime, nullable=True)
    user_id = Column(String, nullable=True, index=True)
    github_url = Column(String, nullable=True)  # GitHub repository URL
    machine_id = Column(String, nullable=True)  # Fly.io machine ID
    machine_state = Column(String, nullable=True)  # Machine state (started, stopped, etc.)


# Create tables
Base.metadata.create_all(bind=engine)
