from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from setta.database.table_definitions import BaseTable


class DBE:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{self.path}")
        self._session = sessionmaker(self.engine)
        BaseTable.metadata.create_all(self.engine)

    @property
    def session(self):
        return self._session.begin()
