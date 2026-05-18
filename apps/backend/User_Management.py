import os
from Database import get_conn


# ── Teams ─────────────────────────────────────────────────────────────────────

def create_team(name: str, description: str = "") -> dict | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO teams (name, description) VALUES (%s, %s) RETURNING id, name, description",
                (name, description),
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as exc:
        conn.rollback()
        print(f"create_team failed: {repr(exc)}")
        return None
    finally:
        conn.close()


def list_teams() -> list[dict]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, description FROM teams ORDER BY name")
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        print(f"list_teams failed: {repr(exc)}")
        return []
    finally:
        conn.close()


def delete_team(team_id: int) -> bool:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM teams WHERE id = %s", (team_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as exc:
        conn.rollback()
        print(f"delete_team failed: {repr(exc)}")
        return False
    finally:
        conn.close()


# ── Users ─────────────────────────────────────────────────────────────────────

def create_user(
    username: str,
    password_hash: str,
    email: str = "",
    roles: list[str] | None = None,
    team_id: int | None = None,
) -> dict | None:
    if roles is None:
        roles = ["member"]
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO team_users (username, email, roles, team_id, password_hash)
                   VALUES (%s, %s, %s, %s, %s)
                   RETURNING id, username, email, roles, team_id""",
                (username, email, roles, team_id, password_hash),
            )
            row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception as exc:
        conn.rollback()
        print(f"create_user failed: {repr(exc)}")
        return None
    finally:
        conn.close()


def get_user_by_username(username: str) -> dict | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, roles, team_id, password_hash FROM team_users WHERE username = %s",
                (username,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"get_user_by_username failed: {repr(exc)}")
        return None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> dict | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, roles, team_id FROM team_users WHERE id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as exc:
        print(f"get_user_by_id failed: {repr(exc)}")
        return None
    finally:
        conn.close()


def delete_user(user_id: int) -> bool:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM team_users WHERE id = %s", (user_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as exc:
        conn.rollback()
        print(f"delete_user failed: {repr(exc)}")
        return False
    finally:
        conn.close()


# ── Host assignments ──────────────────────────────────────────────────────────

def assign_host(team_id: int, hostname: str) -> bool:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO host_assignments (hostname, team_id)
                   VALUES (%s, %s)
                   ON CONFLICT (hostname) DO UPDATE SET team_id = EXCLUDED.team_id""",
                (hostname, team_id),
            )
        conn.commit()
        return True
    except Exception as exc:
        conn.rollback()
        print(f"assign_host failed: {repr(exc)}")
        return False
    finally:
        conn.close()


def unassign_host(hostname: str) -> bool:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM host_assignments WHERE hostname = %s", (hostname,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    except Exception as exc:
        conn.rollback()
        print(f"unassign_host failed: {repr(exc)}")
        return False
    finally:
        conn.close()


# ── Overview ──────────────────────────────────────────────────────────────────

def get_overview(team_id: int | None = None) -> list[dict]:
    """Returns teams with members and assigned hostnames. Pass team_id to filter to one team."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            base = """
                SELECT
                    t.id,
                    t.name,
                    t.description,
                    (
                        SELECT COALESCE(
                            json_agg(json_build_object(
                                'id',       u.id,
                                'username', u.username,
                                'email',    u.email,
                                'roles',    u.roles
                            )), '[]'::json
                        )
                        FROM team_users u
                        WHERE u.team_id = t.id
                    ) AS users,
                    (
                        SELECT COALESCE(json_agg(ha.hostname), '[]'::json)
                        FROM host_assignments ha
                        WHERE ha.team_id = t.id
                    ) AS hosts
                FROM teams t
            """
            if team_id is not None:
                cur.execute(base + " WHERE t.id = %s ORDER BY t.name", (team_id,))
            else:
                cur.execute(base + " ORDER BY t.name")
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        print(f"get_overview failed: {repr(exc)}")
        return []
    finally:
        conn.close()


def update_password(user_id: int, password_hash: str) -> bool:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE team_users SET password_hash = %s WHERE id = %s",
                (password_hash, user_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
        return updated
    except Exception as exc:
        conn.rollback()
        print(f"update_password failed: {repr(exc)}")
        return False
    finally:
        conn.close()


def list_users(team_id: int | None = None) -> list[dict]:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if team_id is not None:
                cur.execute(
                    """SELECT u.id, u.username, u.email, u.roles, u.team_id, t.name AS team_name
                       FROM team_users u
                       LEFT JOIN teams t ON u.team_id = t.id
                       WHERE u.team_id = %s
                       ORDER BY u.username""",
                    (team_id,),
                )
            else:
                cur.execute(
                    """SELECT u.id, u.username, u.email, u.roles, u.team_id, t.name AS team_name
                       FROM team_users u
                       LEFT JOIN teams t ON u.team_id = t.id
                       ORDER BY u.username"""
                )
            return [dict(r) for r in cur.fetchall()]
    except Exception as exc:
        print(f"list_users failed: {repr(exc)}")
        return []
    finally:
        conn.close()


def update_user_profile(user_id: int, roles: list[str], team_id: int | None) -> bool:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE team_users SET roles = %s, team_id = %s WHERE id = %s",
                (roles, team_id, user_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
        return updated
    except Exception as exc:
        conn.rollback()
        print(f"update_user_profile failed: {repr(exc)}")
        return False
    finally:
        conn.close()


def get_team_hostnames(team_id: int) -> set:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT hostname FROM host_assignments WHERE team_id = %s", (team_id,))
            return {row["hostname"] for row in cur.fetchall()}
    except Exception as exc:
        print(f"get_team_hostnames failed: {repr(exc)}")
        return set()
    finally:
        conn.close()


def get_team_name(team_id: int) -> str | None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM teams WHERE id = %s", (team_id,))
            row = cur.fetchone()
            return row["name"] if row else None
    except Exception as exc:
        print(f"get_team_name failed: {repr(exc)}")
        return None
    finally:
        conn.close()


# ── Seed default root on first boot ─────────────────────────────────────

def seed_root():
    from Auth import hash_password
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "admin")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM team_users")
            if cur.fetchone()["cnt"] == 0:
                cur.execute(
                    """INSERT INTO team_users (username, email, roles, team_id, password_hash)
                       VALUES (%s, '', %s, NULL, %s)
                       ON CONFLICT (username) DO NOTHING""",
                    (username, ["root"], hash_password(password)),
                )
                print(f"Seeded default root user: '{username}' — change the password after first login.")
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"seed_root failed: {repr(exc)}")
    finally:
        conn.close()
