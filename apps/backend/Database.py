import os
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=dotenv_path, override=True)

_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/zabbix_portal",
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS teams (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) UNIQUE NOT NULL,
    description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS team_users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(255) UNIQUE NOT NULL,
    email         VARCHAR(255) DEFAULT '',
    roles         TEXT[]       DEFAULT '{member}',
    team_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    password_hash VARCHAR(255) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS host_assignments (
    hostname VARCHAR(255) PRIMARY KEY,
    team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE
);
"""

_MIGRATIONS = """
ALTER TABLE team_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT '';

DO $$
BEGIN
  -- Migrate single role column → roles array (existing deployments)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_users' AND column_name = 'roles'
  ) THEN
    ALTER TABLE team_users ADD COLUMN roles TEXT[] DEFAULT '{member}';
    UPDATE team_users SET roles = ARRAY[role] WHERE role IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_users' AND column_name = 'role'
  ) THEN
    ALTER TABLE team_users DROP COLUMN role;
  END IF;
END $$;
"""


def get_conn():
    return psycopg2.connect(_DATABASE_URL, cursor_factory=RealDictCursor)


def init_db():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(_SCHEMA)
            cur.execute(_MIGRATIONS)
        conn.commit()
        print("Database schema ready.")
    except Exception as exc:
        conn.rollback()
        print(f"Database init failed: {repr(exc)}")
        raise
    finally:
        conn.close()
