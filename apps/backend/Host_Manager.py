from Zabbix_Base import Zabbix_Base
import openpyxl
from io import BytesIO


class Host_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        print("Host Manager ready.")

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
            print("❌ Template name is missing.")
            return None

        template_name = str(template_name).strip()
        if not template_name:
            print("❌ Template name is empty.")
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
            print(f"❌ Template '{template_name}' not found.")
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
            print(f"❌ Failed to list templates: {e}")
            return []

    # ------------------------------------------------------------------
    # PUBLIC API
    # ------------------------------------------------------------------

    def create_server(
        self, hostname, ip_address, group_id="2", template_name="Linux by Zabbix agent"
    ):
        """Creates a host in Zabbix and links it to a template."""
        if not self.zapi:
            print("❌ No API connection available.")
            return None

        tid = self.get_template_id(template_name)
        if not tid:
            return None

        try:
            result = self.zapi.host.create(
                host=hostname,
                interfaces=[
                    {
                        "type": 1,
                        "main": 1,
                        "useip": 1,
                        "ip": ip_address,
                        "dns": "",
                        "port": "10050",
                    }
                ],
                groups=[{"groupid": group_id}],
                templates=[{"templateid": tid}],
            )
            host_id = result["hostids"][0]
            print(f"✅ Created host: {hostname} (ID: {host_id})")
            return host_id

        except Exception as e:
            print(f"❌ Failed to create host '{hostname}': {repr(e)}")
            return None

    def delete_server(self, hostname):
        """Finds a host by name and deletes it from Zabbix."""
        if not self.zapi:
            print("❌ No API connection.")
            return False

        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]}, output=["hostid"]
            )

            if not host_data:
                print(f"⚠️ Host '{hostname}' not found.")
                return False

            host_id = host_data[0]["hostid"]
            self.zapi.host.delete([host_id])
            print(f"🗑️ Deleted host: {hostname} (ID: {host_id})")
            return True

        except Exception as e:
            print(f"❌ Failed to delete host '{hostname}': {repr(e)}")
            return False

    def get_hosts(self, team_name: str | None = None):
        """Retrieves hosts from Zabbix. Pass team_name to filter by the 'team' tag."""
        if not self.zapi:
            return []

        try:
            kwargs: dict = {
                "output": ["hostid", "host", "name", "status"],
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
                    print(f"⚠️ Could not fetch problem counts: {repr(exc)}")
                    for h in hosts:
                        h["problem_count"] = 0

            print(f"✅ Retrieved {len(hosts)} hosts.")
            return hosts
        except Exception as e:
            print(f"❌ Failed to retrieve hosts: {repr(e)}")
            return []

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
            tags = [t for t in host.get("tags", []) if t.get("tag") != "team"]
            tags.append({"tag": "team", "value": team_name})
            self.zapi.host.update(hostid=host["hostid"], tags=tags)
            return True
        except Exception as e:
            print(f"❌ Failed to tag host '{hostname}': {repr(e)}")
            return False

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
            tags = [t for t in host.get("tags", []) if t.get("tag") != "team"]
            self.zapi.host.update(hostid=host["hostid"], tags=tags)
            return True
        except Exception as e:
            print(f"❌ Failed to untag host '{hostname}': {repr(e)}")
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
            print(f"❌ get_host_team failed for '{hostname}': {repr(e)}")
            return None

    def export_hosts_to_excel(self, file_path="zabbix_inventory.xlsx"):
        """Fetches all hosts and writes them to an Excel (.xlsx) file."""
        if not self.zapi:
            print("❌ No API connection.")
            return None

        try:
            excel_bytes = self.export_hosts_to_excel_bytes()
            if not excel_bytes:
                return None

            with open(file_path, "wb") as f:
                f.write(excel_bytes)
            print(f"✅ Exported hosts to {file_path}")
            return file_path

        except Exception as e:
            print(f"❌ Failed to export hosts: {repr(e)}")
            return None

    def export_hosts_to_excel_bytes(self) -> bytes | None:
        """Fetches all hosts and returns an Excel (.xlsx) as bytes (no disk write)."""
        if not self.zapi:
            print("❌ No API connection.")
            return None

        try:
            hosts = self.zapi.host.get(
                output=["hostid", "host", "name", "status"],
                selectInterfaces=["ip", "port"],
            )

            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Zabbix Hosts"

            ws.append(
                [
                    "Host ID",
                    "Technical Name",
                    "Visible Name",
                    "Status",
                    "IP Address",
                    "Port",
                ]
            )

            for h in hosts:
                ip = h["interfaces"][0]["ip"] if h.get("interfaces") else "N/A"
                port = h["interfaces"][0]["port"] if h.get("interfaces") else "N/A"
                status = "Enabled" if h["status"] == "0" else "Disabled"
                ws.append([h["hostid"], h["host"], h["name"], status, ip, port])

            buf = BytesIO()
            wb.save(buf)
            return buf.getvalue()
        except Exception as e:
            print(f"❌ Failed to export hosts: {repr(e)}")
            return None
