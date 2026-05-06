import os
from contextlib import contextmanager
from typing import Iterator

import psycopg
from dotenv import load_dotenv

load_dotenv()


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")
    return url


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(get_database_url()) as conn:
        yield conn


@contextmanager
def get_cursor(*, commit: bool = True) -> Iterator[psycopg.Cursor]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            yield cur
        if commit:
            conn.commit()
