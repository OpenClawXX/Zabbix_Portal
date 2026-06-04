import os
import secrets
import threading

from Zabbix_Base import Zabbix_Base

# How often (seconds) the background thread runs a full sync.
# Override with ZABBIX_SYNC_INTERVAL env var.
_SYNC_INTERVAL = int(os.getenv("ZABBIX_SYNC_INTERVAL", "60"))

# ── Role definitions ──────────────────────────────────────────────────────────
#
#   root       — full access across all teams; can create/delete teams,
#                manage all users, see all hosts, grant any role.
#   team_lead  — manages own team: add/remove users, assign hosts,
#                full host & monitoring CRUD within the team.
#   operator   — manages own team's hosts and monitoring (create/delete hosts,
#                add items/triggers); no user management.
#   member     — read-only; can only see hosts assigned to their own team.
#   auditor    — read-only cross-team visibility; cannot write anything.
#                Only root can grant this role.
#
# ── Zabbix user type → portal role mapping ───────────────────────────────────
#
#   Zabbix Super admin (type 3) → root
#   Zabbix Admin       (type 2) → team_lead
#   Zabbix User        (type 1) → member
#
# ── Default Zabbix group → portal role mapping ───────────────────────────────
#
#   "Zabbix administrators" → root      (platform admins)
#   "Guests"                → member    (read-only observers)
#   "Internal"              → member    (internal read-only accounts)
#   "No access to frontend" → skipped   (API-only; cannot use portal)
#
#   Any other group name is treated as a portal team name and imported as-is.
#
# ── Items and triggers ────────────────────────────────────────────────────────
#
#   Items and triggers are read directly from Zabbix API on every request —
#   they are never stored in the portal DB, so they are always up to date.
#   Writes (create item, create trigger) go directly to Zabbix via Item_Manager.
#   No separate sync is needed for items or triggers.

_ROLE_TO_TYPE: dict[str, int] = {
    "root": 3,  # Zabbix Super admin
    "team_lead": 2,  # Zabbix Admin
    "operator": 1,  # Zabbix User
    "auditor": 1,
    "member": 1,
}

_TYPE_TO_ROLES: dict[int, list[str]] = {
    3: ["root"],
    2: ["team_lead"],
    1: ["member"],
}

# Default Zabbix groups that map directly to portal roles (not imported as teams)
_GROUP_ROLE_MAP: dict[str, str] = {
    "Zabbix administrators": "root",
    "Guests": "member",
    "Internal": "member",
}

# Groups whose members cannot access the portal frontend — skip entirely
_SKIP_GROUPS = {"No access to the frontend"}

# Fallback Zabbix user group for portal users with no team assigned
_DEFAULT_GROUP = "Zabbix Portal Users"

# Zabbix host group permission levels
_PERM_READ_WRITE = 3
_PERM_READ = 2


class ZabbixSync(Zabbix_Base):
    """Bidirectional sync: portal users/teams/hosts ↔ Zabbix users/groups/host-groups."""

    def __init__(self):
        super().__init__()
        # Detect API version once to pick correct field names.
        # Zabbix <6 : username field = 'alias', user type set via 'type'
        # Zabbix 6+ : username field = 'username', user type set via 'roleid'
        self._ufield = "username"
        self._zabbix_major = 6
        self._zabbix_minor = 0
        # roleid cache: maps user type int (1/2/3) → Zabbix roleid string
        self._roleids: dict[int, str] = {}

        # API field names that changed in Zabbix 6.2+:
        #   usergroup.update: 'rights'         → 'hostgroup_rights'
        #   host.get select:  'selectGroups'   → 'selectHostGroups'
        #   host object key:  'groups'         → 'hostgroups'
        self._rights_field = "hostgroup_rights"
        self._select_hg_param = "selectHostGroups"
        self._host_hg_key = "hostgroups"
        self._on_sync = None  # optional callback fired after every full_sync()

        if self.zapi:
            try:
                parts = str(self.zapi.api_version()).split(".")
                self._zabbix_major = int(parts[0])
                self._zabbix_minor = int(parts[1]) if len(parts) > 1 else 0
                self._ufield = "username" if self._zabbix_major >= 6 else "alias"
                old_api = self._zabbix_major < 6 or (
                    self._zabbix_major == 6 and self._zabbix_minor < 2
                )
                if old_api:
                    self._rights_field = "rights"
                    self._select_hg_param = "selectGroups"
                    self._host_hg_key = "groups"
            except Exception:
                pass
            if self._zabbix_major >= 6:
                self._roleids = self._fetch_roleids()
        print(
            f"ZabbixSync: Zabbix {self._zabbix_major}.{self._zabbix_minor} — "
            f"rights_field='{self._rights_field}', "
            f"host_groups_param='{self._select_hg_param}'."
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _fetch_roleids(self) -> dict[int, str]:
        """Query Zabbix for its role IDs and map them to user types 1/2/3."""
        result: dict[int, str] = {}
        try:
            roles = self.zapi.role.get(output=["roleid", "name", "type"])
            for role in roles:
                t = int(role.get("type", 0))
                if t in (1, 2, 3) and t not in result:
                    result[t] = str(role["roleid"])
            print(f"ZabbixSync: resolved roleids = {result}")
        except Exception as exc:
            print(f"ZabbixSync._fetch_roleids failed: {repr(exc)}")
        return result

    def _roleid_for(self, user_type: int) -> str:
        if user_type in self._roleids:
            return self._roleids[user_type]
        for t in range(user_type, 0, -1):
            if t in self._roleids:
                return self._roleids[t]
        return "1"

    def _get_zabbix_user(self, username: str) -> dict | None:
        try:
            rows = self.zapi.user.get(
                filter={self._ufield: username},
                output=["userid", self._ufield],
            )
            return rows[0] if rows else None
        except Exception as exc:
            print(f"ZabbixSync._get_zabbix_user('{username}') failed: {repr(exc)}")
            return None

    def _get_or_create_usergroup(self, name: str) -> str | None:
        """Return usrgrpid for a Zabbix user group, creating it if absent."""
        try:
            existing = self.zapi.usergroup.get(
                filter={"name": name}, output=["usrgrpid"]
            )
            if existing:
                return existing[0]["usrgrpid"]
            result = self.zapi.usergroup.create(name=name, gui_access=0, users_status=0)
            return result["usrgrpids"][0]
        except Exception as exc:
            print(f"ZabbixSync._get_or_create_usergroup('{name}') failed: {repr(exc)}")
            return None

    def _get_or_create_hostgroup(self, name: str) -> str | None:
        """Return groupid for a Zabbix host group, creating it if absent."""
        try:
            existing = self.zapi.hostgroup.get(
                filter={"name": name}, output=["groupid"]
            )
            if existing:
                return existing[0]["groupid"]
            result = self.zapi.hostgroup.create(name=name)
            return result["groupids"][0]
        except Exception as exc:
            print(f"ZabbixSync._get_or_create_hostgroup('{name}') failed: {repr(exc)}")
            return None

    def _set_usergroup_permission(
        self, usrgrpid: str, host_groupid: str, perm: int = _PERM_READ_WRITE
    ) -> None:
        """Give a user group read-write access to a host group.

        Sets the rights directly. permission must be an integer:
          2 = read, 3 = read-write (Zabbix rejects strings).
        """
        try:
            self.zapi.usergroup.update(
                usrgrpid=usrgrpid,
                **{self._rights_field: [{"permission": perm, "id": host_groupid}]},
            )
            print(
                f"ZabbixSync: set permission={perm} for usrgrp={usrgrpid} on hostgroup={host_groupid}."
            )
        except Exception as exc:
            print(f"ZabbixSync._set_usergroup_permission FAILED: {repr(exc)}")

    def _user_type(self, roles: list[str]) -> int:
        return max((_ROLE_TO_TYPE.get(r, 1) for r in roles), default=1)

    # ── Portal → Zabbix: users ────────────────────────────────────────────────

    def push_user(
        self, username: str, password: str, roles: list[str], team_name: str | None
    ) -> None:
        """Create or update a Zabbix user to match the portal user."""
        if not self.zapi:
            return
        usrgrpid = self._get_or_create_usergroup(
            team_name if team_name else _DEFAULT_GROUP
        )
        if not usrgrpid:
            print(
                f"ZabbixSync.push_user('{username}'): could not resolve user group — skipping."
            )
            return
        usrgrps = [{"usrgrpid": usrgrpid}]
        user_type = self._user_type(roles)
        existing = self._get_zabbix_user(username)
        try:
            if existing:
                update: dict = {"userid": existing["userid"], "usrgrps": usrgrps}
                if password:
                    update["passwd"] = password
                if self._zabbix_major >= 6:
                    update["roleid"] = self._roleid_for(user_type)
                else:
                    update["type"] = user_type
                self.zapi.user.update(**update)
            else:
                payload: dict = {
                    self._ufield: username,
                    "passwd": password,
                    "usrgrps": usrgrps,
                    "name": username,
                }
                if self._zabbix_major >= 6:
                    payload["roleid"] = self._roleid_for(user_type)
                else:
                    payload["type"] = user_type
                self.zapi.user.create(**payload)
            print(f"ZabbixSync: pushed user '{username}' to Zabbix (type={user_type}).")
        except Exception as exc:
            print(f"ZabbixSync.push_user('{username}') FAILED: {repr(exc)}")

    def delete_user(self, username: str) -> None:
        """Delete a Zabbix user matching the portal user."""
        if not self.zapi:
            return
        existing = self._get_zabbix_user(username)
        if not existing:
            return
        try:
            self.zapi.user.delete(existing["userid"])
            print(f"ZabbixSync: deleted user '{username}' from Zabbix.")
        except Exception as exc:
            print(f"ZabbixSync.delete_user('{username}') failed: {repr(exc)}")

    def update_password(self, username: str, new_password: str) -> None:
        """Sync a password change to Zabbix."""
        if not self.zapi:
            return
        existing = self._get_zabbix_user(username)
        if not existing:
            return
        try:
            self.zapi.user.update(userid=existing["userid"], passwd=new_password)
            print(f"ZabbixSync: updated password for '{username}' in Zabbix.")
        except Exception as exc:
            print(f"ZabbixSync.update_password('{username}') failed: {repr(exc)}")

    # ── Portal → Zabbix: teams and host visibility ────────────────────────────

    def push_team(self, team_name: str) -> None:
        """Create a Zabbix user group and host group for the team, and wire permissions.

        This is what makes team members able to see their hosts in the Zabbix UI:
          user group  → has read-write permission on →  host group (same name)
        Hosts assigned to the team are placed in that host group.
        """
        if not self.zapi:
            return
        usrgrpid = self._get_or_create_usergroup(team_name)
        host_grpid = self._get_or_create_hostgroup(team_name)
        if usrgrpid and host_grpid:
            self._set_usergroup_permission(usrgrpid, host_grpid)
            print(
                f"ZabbixSync: team '{team_name}' → user group + host group + permissions set."
            )

    def delete_team(self, team_name: str) -> None:
        """Delete the Zabbix user group and host group that match a portal team."""
        if not self.zapi:
            return
        try:
            ug = self.zapi.usergroup.get(
                filter={"name": team_name}, output=["usrgrpid"]
            )
            if ug:
                self.zapi.usergroup.delete(ug[0]["usrgrpid"])
            hg = self.zapi.hostgroup.get(filter={"name": team_name}, output=["groupid"])
            if hg:
                self.zapi.hostgroup.delete(hg[0]["groupid"])
            print(
                f"ZabbixSync: deleted Zabbix user group and host group for '{team_name}'."
            )
        except Exception as exc:
            print(f"ZabbixSync.delete_team('{team_name}') failed: {repr(exc)}")

    # ── Portal → Zabbix: host assignments ────────────────────────────────────

    def push_host_to_team(self, hostname: str, team_name: str) -> None:
        """Add a Zabbix host to the team's host group so team members can see it."""
        if not self.zapi:
            return
        try:
            hosts = self.zapi.host.get(
                filter={"host": hostname},
                output=["hostid"],
                **{self._select_hg_param: ["groupid"]},
            )
            if not hosts:
                print(
                    f"ZabbixSync.push_host_to_team: host '{hostname}' not found in Zabbix."
                )
                return
            host = hosts[0]
            host_grpid = self._get_or_create_hostgroup(team_name)
            if not host_grpid:
                return
            current_groups = [
                {"groupid": g["groupid"]} for g in host.get(self._host_hg_key, [])
            ]
            if not any(g["groupid"] == host_grpid for g in current_groups):
                self.zapi.host.update(
                    hostid=host["hostid"],
                    groups=current_groups + [{"groupid": host_grpid}],
                )
                print(
                    f"ZabbixSync: host '{hostname}' added to Zabbix host group '{team_name}'."
                )
            else:
                print(
                    f"ZabbixSync: host '{hostname}' already in host group '{team_name}'."
                )
        except Exception as exc:
            print(
                f"ZabbixSync.push_host_to_team('{hostname}', '{team_name}') FAILED: {repr(exc)}"
            )

    def remove_host_from_team(self, hostname: str, team_name: str) -> None:
        """Remove a Zabbix host from the team's host group."""
        if not self.zapi:
            return
        try:
            hg = self.zapi.hostgroup.get(filter={"name": team_name}, output=["groupid"])
            if not hg:
                return
            host_grpid = hg[0]["groupid"]
            hosts = self.zapi.host.get(
                filter={"host": hostname},
                output=["hostid"],
                **{self._select_hg_param: ["groupid"]},
            )
            if not hosts:
                return
            host = hosts[0]
            remaining = [
                {"groupid": g["groupid"]}
                for g in host.get(self._host_hg_key, [])
                if g["groupid"] != host_grpid
            ]
            if not remaining:
                # Hosts must belong to at least one group — keep the original if this would leave none
                print(
                    f"ZabbixSync: skipping removal of '{hostname}' from '{team_name}' — would leave host with no group."
                )
                return
            self.zapi.host.update(hostid=host["hostid"], groups=remaining)
            print(
                f"ZabbixSync: host '{hostname}' removed from Zabbix host group '{team_name}'."
            )
        except Exception as exc:
            print(
                f"ZabbixSync.remove_host_from_team('{hostname}', '{team_name}') failed: {repr(exc)}"
            )

    # ── Zabbix → Portal: full sync ────────────────────────────────────────────

    def bootstrap_teams(self) -> None:
        """Ensure every portal team is fully set up in Zabbix.

        For each portal team this creates (if missing):
          - Zabbix user group
          - Zabbix host group
          - Read-write permission from user group → host group
          - Adds every assigned host to the host group

        Call this once at startup so pre-existing teams and host assignments
        are visible to team members in the Zabbix UI.
        """
        if not self.zapi:
            return
        import User_Management as um

        teams = um.list_teams()
        for team in teams:
            team_name = team["name"]
            self.push_team(team_name)

            hostnames = um.get_team_hostnames(team["id"])
            for hostname in hostnames:
                self.push_host_to_team(hostname, team_name)

        print(f"ZabbixSync.bootstrap_teams: bootstrapped {len(teams)} team(s).")

    def pull_users(self) -> None:
        """Import Zabbix users and groups into the portal (runs on startup).

        Skips users already in the portal. Generates a temporary password for
        each imported user — print to logs, reset via portal after first login.
        """
        if not self.zapi:
            return
        import User_Management as um
        from Auth import hash_password

        type_field = "roleid" if self._zabbix_major >= 6 else "type"
        roleid_to_type = {v: k for k, v in self._roleids.items()}

        try:
            zabbix_users = self.zapi.user.get(
                output=["userid", self._ufield, type_field],
                selectUsrgrps=["usrgrpid", "name"],
            )
        except Exception as exc:
            print(f"ZabbixSync.pull_users: failed to list Zabbix users: {repr(exc)}")
            return

        portal_teams = {t["name"]: t["id"] for t in um.list_teams()}

        for zu in zabbix_users:
            username = zu.get(self._ufield, "").strip()
            if not username or username.lower() == "guest":
                continue
            if um.get_user_by_username(username):
                continue

            if self._zabbix_major >= 6:
                user_type = roleid_to_type.get(str(zu.get("roleid", "1")), 1)
            else:
                user_type = int(zu.get("type", 1))
            roles = list(_TYPE_TO_ROLES.get(user_type, ["member"]))
            team_id = None

            for grp in zu.get("usrgrps", []):
                grp_name = grp.get("name", "").strip()
                if not grp_name or grp_name in _SKIP_GROUPS:
                    continue
                if grp_name in _GROUP_ROLE_MAP:
                    roles = [_GROUP_ROLE_MAP[grp_name]]
                else:
                    if grp_name not in portal_teams:
                        team = um.create_team(grp_name)
                        if team:
                            portal_teams[grp_name] = team["id"]
                    team_id = portal_teams.get(grp_name)
                break

            temp_password = secrets.token_urlsafe(16)
            um.create_user(
                username=username,
                password_hash=hash_password(temp_password),
                roles=roles,
                team_id=team_id,
            )
            print(
                f"ZabbixSync: imported '{username}' → portal "
                f"(roles={roles}, team_id={team_id}, temp password: {temp_password})"
            )

    def full_sync(self) -> None:
        """Periodic bidirectional sync covering users, groups, and host assignments.

        Runs in the background thread every ZABBIX_SYNC_INTERVAL seconds.

        What it does:
          Users   — import new Zabbix users not yet in portal;
                    remove portal users deleted from Zabbix (root users protected).
          Groups  — import new Zabbix user groups as portal teams.
          Hosts   — sync Zabbix host group memberships to portal host assignments.
          Items / Triggers — read directly from Zabbix per request; no sync needed.
        """
        if not self.zapi:
            return
        import User_Management as um
        from Auth import hash_password

        type_field = "roleid" if self._zabbix_major >= 6 else "type"
        roleid_to_type = {v: k for k, v in self._roleids.items()}

        # ── 1. Fetch current Zabbix state ─────────────────────────────────────
        try:
            zabbix_users = self.zapi.user.get(
                output=["userid", self._ufield, type_field],
                selectUsrgrps=["usrgrpid", "name"],
            )
        except Exception as exc:
            print(f"ZabbixSync.full_sync: failed to fetch users: {repr(exc)}")
            return

        zabbix_usernames = {
            u.get(self._ufield, "").strip().lower() for u in zabbix_users
        }

        # ── 2. Users: import new ones and update changed existing ones ───────
        try:
            portal_teams = {t["name"]: t["id"] for t in um.list_teams()}
            for zu in zabbix_users:
                username = zu.get(self._ufield, "").strip()
                if not username or username.lower() == "guest":
                    continue

                # Resolve role and team from Zabbix
                if self._zabbix_major >= 6:
                    user_type = roleid_to_type.get(str(zu.get("roleid", "1")), 1)
                else:
                    user_type = int(zu.get("type", 1))
                roles = list(_TYPE_TO_ROLES.get(user_type, ["member"]))
                team_id = None
                for grp in zu.get("usrgrps", []):
                    grp_name = grp.get("name", "").strip()
                    if not grp_name or grp_name in _SKIP_GROUPS:
                        continue
                    if grp_name in _GROUP_ROLE_MAP:
                        roles = [_GROUP_ROLE_MAP[grp_name]]
                    else:
                        if grp_name not in portal_teams:
                            team = um.create_team(grp_name)
                            if team:
                                portal_teams[grp_name] = team["id"]
                        team_id = portal_teams.get(grp_name)
                    break

                existing = um.get_user_by_username(username)
                if existing:
                    # Update role/team if changed in Zabbix
                    current_roles = set(existing.get("roles") or [])
                    if (
                        current_roles != set(roles)
                        or existing.get("team_id") != team_id
                    ):
                        um.update_user_profile(existing["id"], roles, team_id)
                        print(
                            f"ZabbixSync: updated '{username}' → roles={roles}, team_id={team_id}."
                        )
                else:
                    temp_password = secrets.token_urlsafe(16)
                    um.create_user(
                        username=username,
                        password_hash=hash_password(temp_password),
                        roles=roles,
                        team_id=team_id,
                    )
                    print(
                        f"ZabbixSync: auto-imported new Zabbix user '{username}' → portal."
                    )
        except Exception as exc:
            print(f"ZabbixSync.full_sync: user import failed: {repr(exc)}")

        # ── 3. Users: remove portal users deleted from Zabbix ─────────────────
        try:
            for u in um.list_users():
                if "root" in (u.get("roles") or []):
                    continue
                if u["username"].lower() not in zabbix_usernames:
                    um.delete_user(u["id"])
                    print(
                        f"ZabbixSync: removed portal user '{u['username']}' — deleted from Zabbix."
                    )
        except Exception as exc:
            print(f"ZabbixSync.full_sync: user deletion sync failed: {repr(exc)}")

        # ── 4. Groups: import new Zabbix user groups as portal teams; remove deleted ──
        try:
            zabbix_groups = self.zapi.usergroup.get(output=["usrgrpid", "name"])
            zabbix_group_names = {
                zg["name"].strip() for zg in zabbix_groups if zg.get("name")
            }
            portal_team_list = um.list_teams()
            portal_team_names = {t["name"] for t in portal_team_list}

            # Import new groups
            for zg in zabbix_groups:
                name = zg.get("name", "").strip()
                if not name or name in _SKIP_GROUPS or name in _GROUP_ROLE_MAP:
                    continue
                if name not in portal_team_names:
                    um.create_team(name)
                    print(
                        f"ZabbixSync: imported new Zabbix group '{name}' as portal team."
                    )

            # Remove portal teams whose Zabbix user group was deleted
            for team in portal_team_list:
                name = team["name"]
                if name in _GROUP_ROLE_MAP or name == _DEFAULT_GROUP:
                    continue
                if name not in zabbix_group_names:
                    um.delete_team(team["id"])
                    print(
                        f"ZabbixSync: removed portal team '{name}' — Zabbix group deleted."
                    )
        except Exception as exc:
            print(f"ZabbixSync.full_sync: group sync failed: {repr(exc)}")

        # ── 5. Hosts: sync Zabbix host group membership → portal assignments ──
        try:
            portal_team_map = {t["name"]: t["id"] for t in um.list_teams()}
            zabbix_hosts = self.zapi.host.get(
                output=["hostid", "host"],
                **{self._select_hg_param: ["groupid", "name"]},
            )

            # Build the set of (hostname, team_name) pairs that Zabbix currently has
            zabbix_assignments: set[tuple[str, str]] = set()
            for zh in zabbix_hosts:
                hostname = zh.get("host", "").strip()
                if not hostname:
                    continue
                for hg in zh.get(self._host_hg_key, []):
                    grp_name = hg.get("name", "").strip()
                    if grp_name in portal_team_map:
                        zabbix_assignments.add((hostname, grp_name))
                        um.assign_host(portal_team_map[grp_name], hostname)

            # Remove portal assignments that no longer exist in Zabbix
            for team in um.get_overview():
                team_name = team["name"]
                if team_name not in portal_team_map:
                    continue
                for hostname in team.get("hosts", []):
                    if (hostname, team_name) not in zabbix_assignments:
                        um.unassign_host(hostname)
                        print(
                            f"ZabbixSync: removed portal assignment '{hostname}' → '{team_name}' — no longer in Zabbix group."
                        )
        except Exception as exc:
            print(f"ZabbixSync.full_sync: host assignment sync failed: {repr(exc)}")

        if self._on_sync:
            try:
                self._on_sync()
            except Exception:
                pass

    # ── Background thread ─────────────────────────────────────────────────────

    def start_realtime_sync(self) -> None:
        """Listen for pg_notify events from Zabbix tables and sync immediately on change.

        Requires notify triggers to be installed via install_notify_triggers() in Database.py.
        Falls back gracefully if the connection drops — errors are printed but do not crash.
        """
        import select as sel
        import psycopg2
        import psycopg2.extensions
        from Database import _DATABASE_URL

        def _listen():
            try:
                conn = psycopg2.connect(_DATABASE_URL)
                conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
                with conn.cursor() as cur:
                    cur.execute("LISTEN zabbix_changes;")
                print(
                    "ZabbixSync: real-time listener active — syncing on Zabbix DB changes."
                )
                while True:
                    if sel.select([conn], [], [], 5.0)[0]:
                        conn.poll()
                        if conn.notifies:
                            conn.notifies.clear()
                            try:
                                self.full_sync()
                            except Exception as exc:
                                print(f"ZabbixSync realtime sync error: {repr(exc)}")
            except Exception as exc:
                print(f"ZabbixSync real-time listener crashed: {repr(exc)}")

        t = threading.Thread(target=_listen, daemon=True, name="zabbix-notify-listener")
        t.start()

    def start_background_sync(self) -> None:
        """Start a daemon thread that runs full_sync every ZABBIX_SYNC_INTERVAL seconds.

        Kept as a safety net alongside start_realtime_sync() to catch any notifications
        that might be missed (e.g. listener restart, network blip).
        """
        if not self.zapi:
            return

        def _loop():
            while True:
                threading.Event().wait(_SYNC_INTERVAL)
                try:
                    self.full_sync()
                except Exception as exc:
                    print(f"ZabbixSync background loop error: {repr(exc)}")

        t = threading.Thread(target=_loop, daemon=True, name="zabbix-sync")
        t.start()
        print(f"ZabbixSync: background full-sync started (interval={_SYNC_INTERVAL}s).")
