from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from setta.database.table_definitions import BaseTable


class DBE:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{self.path}")
        self.session = sessionmaker(self.engine)
        BaseTable.metadata.create_all(self.engine)

    def __enter__(self):
        """Create a context manager that provides a session and auto-commits"""
        self._ctx = self.session.begin()
        self._session = self._ctx.__enter__()
        return self._session

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Delegate to the sessionmaker.begin() context manager"""
        return self._ctx.__exit__(exc_type, exc_val, exc_tb)
