import uuid
from datetime import datetime

from sqlmodel import Field, Session, SQLModel, create_engine

from app.config import settings
from app.schemas import ProjectStatus


class Project(SQLModel, table=True):
    """Project database model"""

    __tablename__ = "projects"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(..., index=True)
    url: str | None = None
    status: str = Field(default=ProjectStatus.CREATING.value)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_checked: datetime | None = None

    def update_status(self, status: ProjectStatus) -> None:
        """Update project status"""
        self.status = status.value
        self.last_checked = datetime.utcnow()


# Create engine
engine = create_engine(
    settings.postgres_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)


def create_db_and_tables():
    """Create database tables"""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Get database session"""
    with Session(engine) as session:
        yield session
