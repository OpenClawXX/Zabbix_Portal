import csv
import io
import logging
from Zabbix_Base import Zabbix_Base
import openpyxl
from io import BytesIO

logger = logging.getLogger(__name__)


class Host_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        logger.info("Host Manager ready.")

    # ------------------------------------------------------------------
    # INTERNAL HELPERS
    # ------------------------------------------------------------------

    def get_template_id_from_name(self, template_name: str):
        """
        Resolve a template from a *name string* and return its templateid.

        Supports exact matches (technical name `host` or visible name `name`),
        then partial matches (case-insensitive) and picks the best match.
        """
        if not self.zapi:
            return None

        if template_name is None:
            logger.warning("get_template_id_from_name: template_name is missing.")
            return None

        template_name = str(template_name).strip()
        if not template_name:
            logger.warning("get_template_id_from_name: template_name is empty.")
            return None

        # Try exact match by internal host name first
        templates = self.zapi.template.get(
            filter={"host": template_name}, output=["templateid", "host", "name"]
        )

        # Fallback: search by visible name
        if not templates:
            templates = self.zapi.template.get(
                filter={"name": template_name}, output=["templateid", "host", "name"]
            )

        # Dynamic fallback: partial match (case-insensitive).
        # Zabbix API supports 'search' for substring matching.
        if not templates:
            templates = self.zapi.template.get(
                search={"host": template_name}, output=["templateid", "host", "name"]
            )
        if not templates:
            templates = self.zapi.template.get(
                search={"name": template_name}, output=["templateid", "host", "name"]
            )

        if not templates:
            logger.warning("Template %r not found.", template_name)
            return None

        q = template_name.casefold()

        def score(t: dict) -> int:
            host = str(t.get("host", "")).casefold()
            name = str(t.get("name", "")).casefold()
            # Prefer exact matches first, then prefix matches, then substring matches.
            if host == q or name == q:
                return 0
            if host.startswith(q) or name.startswith(q):
                return 1
            if q in host or q in name:
                return 2
            return 3

        best = sorted(templates, key=score)[0]
        return best["templateid"]

    def get_template_id(self, template_name="Linux by Zabbix agent"):
        """
        Backwards-compatible wrapper.
        You can pass a template name string and it will resolve to a templateid.
        """
        return self.get_template_id_from_name(template_name)

    def list_templates(self) -> list[dict]:
        """Returns all templates available in Zabbix as [{templateid, name}]."""
        if not self.zapi:
            return []
        try:
            results = self.zapi.template.get(output=["templateid", "name"], sortfield="name")
            return [{"templateid": t["templateid"], "name": t["name"]} for t in results]
        except Exception as e:
            logger.error("list_templates failed: %r", e)
            return []

    # ------------------------------------------------------------------
    # PUBLIC API
    # ------------------------------------------------------------------

    def create_server(
        self, hostname, ip_address, group_ids: list[str] | None = None,
        group_id="2", template_name="Linux by Zabbix agent",
        proxyid: str | None = None,
    ):
        """Creates a host in Zabbix and links it to a template."""
        if not self.zapi:
            logger.error("create_server: no Zabbix API connection.")
            return None

        tid = self.get_template_id(template_name)
        if not tid:
            return None

        resolved_groups = (
            [{"groupid": gid} for gid in group_ids]
            if group_ids
            else [{"groupid": group_id}]
        )

        try:
            params: dict = {
                "host": hostname,
                "interfaces": [
                    {
                        "type": 1,
                        "main": 1,
                        "useip": 1,
                        "ip": ip_address,
                        "dns": "",
                        "port": "10050",
                    }
                ],
                "groups": resolved_groups,
                "templates": [{"templateid": tid}],
            }
            if proxyid:
                # Zabbix ≥7.0 uses "proxyid"; older versions use "proxy_hostid".
                proxy_key = "proxyid" if self._zabbix_version >= (7, 0) else "proxy_hostid"
                params[proxy_key] = proxyid

            result = self.zapi.host.create(**params)
            host_id = result["hostids"][0]
            logger.info("Created host %r (ID: %s).", hostname, host_id)
            self._invalidate("all_hosts")
            return host_id

        except Exception as e:
            logger.error("Failed to create host %r: %r", hostname, e)
            return None

    def delete_server(self, hostname):
        """Finds a host by name and deletes it from Zabbix."""
        if not self.zapi:
            logger.error("delete_server: no Zabbix API connection.")
            return False

        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]}, output=["hostid"]
            )

            if not host_data:
                logger.warning("Host %r not found.", hostname)
                return False

            host_id = host_data[0]["hostid"]
            self.zapi.host.delete([host_id])
            logger.info("Deleted host %r (ID: %s).", hostname, host_id)
            self._invalidate("all_hosts")
            return True

        except Exception as e:
            logger.error("Failed to delete host %r: %r", hostname, e)
            return False

    def get_hosts(self, team_name: str | None = None):
        """Retrieves hosts from Zabbix (60 s TTL cache for the unfiltered list)."""
        if team_name is not None:
            return self._fetch_hosts(team_name)
        return self._cached("all_hosts", 60.0, lambda: self._fetch_hosts(None))

    def _fetch_hosts(self, team_name: str | None = None):
        if not self.zapi:
            return []

        # Zabbix ≥7.0 renamed proxy_hostid → proxyid on the host object.
        proxy_field = "proxyid" if self._zabbix_version >= (7, 0) else "proxy_hostid"

        try:
            kwargs: dict = {
                "output": ["hostid", "host", "name", "status", proxy_field],
                "selectInterfaces": ["ip", "port", "type", "available"],
                "selectTags": "extend",
            }
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name, "operator": 1}]
            hosts = self.zapi.host.get(**kwargs)

            # Attach per-host active problem counts (triggers in problem state)
            if hosts:
                hostids = [h["hostid"] for h in hosts]
                try:
                    problem_triggers = self.zapi.trigger.get(
                        hostids=hostids,
                        value=1,
                        output=["triggerid"],
                        selectHosts=["hostid"],
                    )
                    counts: dict = {}
                    for t in problem_triggers:
                        for h in t.get("hosts", []):
                            hid = h["hostid"]
                            counts[hid] = counts.get(hid, 0) + 1
                    for h in hosts:
                        h["problem_count"] = counts.get(h["hostid"], 0)
                except Exception as exc:
                    logger.warning("Could not fetch problem counts: %r", exc)
                    for h in hosts:
                        h["problem_count"] = 0

            # Normalise proxy field to "proxyid" regardless of Zabbix version.
            if proxy_field == "proxy_hostid":
                for h in hosts:
                    h["proxyid"] = h.pop("proxy_hostid", "0") or "0"

            logger.debug("Retrieved %d hosts.", len(hosts))
            return hosts
        except Exception as e:
            logger.error("get_hosts failed: %r", e)
            return []

    def add_host_to_hostgroup(self, hostname: str, group_name: str) -> bool:
        """Add host to a Zabbix host group without removing existing groups."""
        if not self.zapi:
            return False
        try:
            host_data = self.zapi.host.get(
                filter={"host": hostname},
                output=["hostid"],
                **{"selectHostGroups" if self._zabbix_version >= (6, 2) else "selectGroups": "extend"},
            )
            if not host_data:
                return False
            host = host_data[0]
            hg_key = "hostgroups" if self._zabbix_version >= (6, 2) else "groups"
            existing_groups = [{"groupid": g["groupid"]} for g in host.get(hg_key, [])]

            # Find or create the host group
            hg = self.zapi.hostgroup.get(filter={"name": group_name}, output=["groupid"])
            if not hg:
                result = self.zapi.hostgroup.create(name=group_name)
                group_id = result["groupids"][0]
            else:
                group_id = hg[0]["groupid"]

            # Skip if already a member
            if any(g["groupid"] == group_id for g in existing_groups):
                return True

            self.zapi.host.update(
                hostid=host["hostid"],
                groups=existing_groups + [{"groupid": group_id}],
            )
            logger.info("Added host %r to host group %r.", hostname, group_name)
            return True
        except Exception as e:
            logger.error("add_host_to_hostgroup(%r, %r) failed: %r", hostname, group_name, e)
            return False

    def tag_host(self, hostname: str, team_name: str) -> bool:
        """Add/replace the 'team' tag on a host, preserving all other tags."""
        if not self.zapi:
            return False
        try:
            host_data = self.zapi.host.get(
                filter={"host": hostname},
                output=["hostid"],
                selectTags="extend",
            )
            if not host_data:
                return False
            host = host_data[0]
            tags = [{"tag": t["tag"], "value": t.get("value", "")} for t in host.get("tags", []) if t.get("tag") != "team"]
            tags.append({"tag": "team", "value": team_name})
            self.zapi.host.update(hostid=host["hostid"], tags=tags)
            return True
        except Exception as e:
            logger.error("tag_host(%r) failed: %r", hostname, e)
            return False

    def update_host_tags(self, hostname: str, tags: list[dict]) -> tuple[bool, str | None]:
        """Replace all non-team tags on a host with the supplied list.
        The 'team' tag is always preserved and cannot be overwritten here.
        Returns (success, error_message).
        """
        if not self.zapi:
            return False, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]},
                output=["hostid"],
                selectTags="extend",
            )
            if not host_data:
                return False, f"Host '{hostname}' not found in Zabbix."
            host = host_data[0]
            # Only keep tag/value — Zabbix 7.x returns extra fields like "automatic" that host.update rejects
            team_tags = [{"tag": t["tag"], "value": t.get("value", "")} for t in host.get("tags", []) if t.get("tag") == "team"]
            custom_tags = [{"tag": t["tag"], "value": t.get("value", "")} for t in tags if t.get("tag") != "team"]
            self.zapi.host.update(hostid=host["hostid"], tags=team_tags + custom_tags)
            logger.info("Updated tags on host %r.", hostname)
            return True, None
        except Exception as e:
            logger.error("update_host_tags(%r) failed: %r", hostname, e)
            return False, str(e)

    def untag_host(self, hostname: str) -> bool:
        """Remove the 'team' tag from a host, preserving all other tags."""
        if not self.zapi:
            return False
        try:
            host_data = self.zapi.host.get(
                filter={"host": hostname},
                output=["hostid"],
                selectTags="extend",
            )
            if not host_data:
                return False
            host = host_data[0]
            tags = [{"tag": t["tag"], "value": t.get("value", "")} for t in host.get("tags", []) if t.get("tag") != "team"]
            self.zapi.host.update(hostid=host["hostid"], tags=tags)
            return True
        except Exception as e:
            logger.error("untag_host(%r) failed: %r", hostname, e)
            return False

    def get_host_team(self, hostname: str) -> str | None:
        """Returns the value of the 'team' tag on this host, or None if absent."""
        if not self.zapi:
            return None
        try:
            host_data = self.zapi.host.get(
                filter={"host": hostname},
                output=["hostid"],
                selectTags="extend",
            )
            if not host_data:
                return None
            for t in host_data[0].get("tags", []):
                if t.get("tag") == "team":
                    return t.get("value")
            return None
        except Exception as e:
            logger.error("get_host_team(%r) failed: %r", hostname, e)
            return None

    def export_hosts_to_excel(self, file_path="zabbix_inventory.xlsx"):
        """Fetches all hosts and writes them to an Excel (.xlsx) file."""
        if not self.zapi:
            logger.error("export_hosts_to_excel: no Zabbix API connection.")
            return None

        try:
            excel_bytes = self.export_hosts_to_excel_bytes()
            if not excel_bytes:
                return None

            with open(file_path, "wb") as f:
                f.write(excel_bytes)
            logger.info("Exported hosts to %r.", file_path)
            return file_path

        except Exception as e:
            logger.error("export_hosts_to_excel failed: %r", e)
            return None

    # ------------------------------------------------------------------
    # EXPORT HELPERS
    # ------------------------------------------------------------------

    _AVAIL_LABEL = {"0": "Unknown", "1": "Available", "2": "Unavailable"}
    _EXPORT_HEADERS = [
        "Host ID",
        "Technical Name",
        "Visible Name",
        "Status",
        "Availability",
        "IP Address",
        "Port",
        "Proxy",
        "Host Groups",
        "Templates",
        "Description",
    ]

    def _build_proxy_map(self) -> dict[str, str]:
        """Returns {proxyid: proxy_name}. Tries the 6.0+ 'name' field, falls back to 'host'."""
        try:
            proxies = self.zapi.proxy.get(output=["proxyid", "name", "host"])  # type: ignore[union-attr]
            return {p["proxyid"]: (p.get("name") or p.get("host") or "") for p in proxies}
        except Exception:
            return {}

    def _fetch_export_rows(self, hostname_filter: set[str] | None = None) -> list[list[str]]:
        """Returns a list of rows (each a list of str) for the host export."""
        hosts = self.zapi.host.get(  # type: ignore[union-attr]
            output=["hostid", "host", "name", "status", "description", "proxyid", "proxy_hostid"],
            selectInterfaces=["ip", "port", "available", "type"],
            selectGroups=["name"],
            selectParentTemplates=["name"],
        )
        if hostname_filter is not None:
            hosts = [h for h in hosts if h["host"] in hostname_filter]

        proxy_map = self._build_proxy_map()

        rows: list[list[str]] = []
        for h in hosts:
            interfaces = h.get("interfaces") or []
            primary = next((i for i in interfaces if str(i.get("type")) == "1"), None) or (interfaces[0] if interfaces else None)
            ip = primary["ip"] if primary else "N/A"
            port = primary["port"] if primary else "N/A"
            avail = self._AVAIL_LABEL.get(str(primary.get("available", "0")), "Unknown") if primary else "Unknown"
            status = "Enabled" if h["status"] == "0" else "Disabled"
            # proxyid is used in Zabbix 6.0+; proxy_hostid in older versions
            pid = h.get("proxyid") or h.get("proxy_hostid") or "0"
            proxy = proxy_map.get(pid, "") if pid and pid != "0" else "—"
            groups = ", ".join(g["name"] for g in (h.get("groups") or []))
            templates = ", ".join(t["name"] for t in (h.get("parentTemplates") or []))
            description = (h.get("description") or "").strip()
            rows.append([h["hostid"], h["host"], h["name"], status, avail, ip, port, proxy, groups, templates, description])
        return rows

    def export_hosts_to_excel_bytes(self, hostname_filter: set[str] | None = None) -> bytes | None:
        """Returns host inventory as .xlsx bytes."""
        if not self.zapi:
            logger.error("export_hosts_to_excel_bytes: no Zabbix API connection.")
            return None
        try:
            rows = self._fetch_export_rows(hostname_filter)
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Zabbix Hosts"
            ws.append(self._EXPORT_HEADERS)
            for row in rows:
                ws.append(row)
            buf = BytesIO()
            wb.save(buf)
            return buf.getvalue()
        except Exception as e:
            logger.error("export_hosts_to_excel_bytes failed: %r", e)
            return None

    def export_hosts_to_csv_bytes(self, hostname_filter: set[str] | None = None) -> bytes | None:
        """Returns host inventory as .csv bytes (UTF-8 with BOM for Excel compat)."""
        if not self.zapi:
            logger.error("export_hosts_to_csv_bytes: no Zabbix API connection.")
            return None
        try:
            rows = self._fetch_export_rows(hostname_filter)
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(self._EXPORT_HEADERS)
            writer.writerows(rows)
            # UTF-8 BOM so Excel opens it correctly without an import wizard
            return ("﻿" + buf.getvalue()).encode("utf-8")
        except Exception as e:
            logger.error("export_hosts_to_csv_bytes failed: %r", e)
            return None
