import logging
import time

from Zabbix_Base import Zabbix_Base

logger = logging.getLogger(__name__)

SEVERITY_NAMES = {
    "0": "Not classified",
    "1": "Information",
    "2": "Warning",
    "3": "Average",
    "4": "High",
    "5": "Disaster",
}


class Metrics_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        logger.info("Metrics Manager ready.")

    def get_problems(self) -> list[dict]:
        """Return active problems enriched with host name and age."""
        if not self.zapi:
            return []
        try:
            # problem.get only accepts "eventid" as sortfield — severity/clock are
            # not valid here (they are valid for event.get). Sort by severity
            # client-side after enrichment so the UI still sees highest first.
            problems = self.zapi.problem.get(
                output=[
                    "eventid",
                    "objectid",
                    "severity",
                    "name",
                    "clock",
                    "acknowledged",
                ],
                recent=True,
                sortfield="eventid",
                sortorder="DESC",
                limit=200,
            )
            if not problems:
                return []

            trigger_ids = [p["objectid"] for p in problems]
            triggers = self.zapi.trigger.get(
                triggerids=trigger_ids,
                output=["triggerid"],
                selectHosts=["host", "hostid"],
            )
            trigger_map = {t["triggerid"]: t for t in triggers}

            now = int(time.time())
            result = []
            for p in problems:
                trigger = trigger_map.get(p["objectid"], {})
                hosts = trigger.get("hosts", [])
                hostname = hosts[0]["host"] if hosts else "Unknown"
                result.append(
                    {
                        "eventid": p["eventid"],
                        "hostname": hostname,
                        "severity": int(p["severity"]),
                        "severity_name": SEVERITY_NAMES.get(p["severity"], "Unknown"),
                        "name": p["name"],
                        "clock": int(p["clock"]),
                        "age_seconds": now - int(p["clock"]),
                        "acknowledged": p["acknowledged"] == "1",
                    }
                )
            # Sort highest severity first, then most recent within same severity
            result.sort(key=lambda x: (-x["severity"], -x["clock"]))
            return result
        except Exception as e:
            logger.error("get_problems failed: %r", e)
            return []

    def acknowledge_problem(self, eventid: str, message: str = "Acknowledged via Zabbix Portal") -> bool:
        """Acknowledge a Zabbix problem event. Returns True on success."""
        if not self.zapi:
            return False
        try:
            # action bitmask: 2 = acknowledge, 4 = add message  →  6 = both
            self.zapi.event.acknowledge(
                eventids=[eventid],
                action=6,
                message=message,
            )
            return True
        except Exception as e:
            logger.error("acknowledge_problem failed for eventid=%s: %r", eventid, e)
            return False

    def get_item_history(self, itemid: str, minutes: int = 360) -> dict:
        """Return time-series history for a single numeric item."""
        if not self.zapi:
            return {"history": [], "item_name": "", "units": ""}
        try:
            items = self.zapi.item.get(
                itemids=[itemid],
                output=["itemid", "name", "value_type", "units"],
            )
            if not items:
                return {"history": [], "item_name": "", "units": ""}

            item = items[0]
            value_type = int(item["value_type"])

            # Only float (0) and integer (3) can be graphed meaningfully
            if value_type not in (0, 3):
                return {
                    "history": [],
                    "item_name": item["name"],
                    "units": item.get("units", ""),
                }

            time_till = int(time.time())
            time_from = time_till - minutes * 60

            if minutes > 1440:
                # Periods longer than 24 h: use hourly trend aggregates.
                # history.get would cap at a few thousand raw points and miss most
                # of the range; trend.get returns one avg point per hour — always
                # accurate and fast.
                trends = self.zapi.trend.get(
                    itemids=[itemid],
                    time_from=time_from,
                    time_till=time_till,
                    output=["clock", "value_avg"],
                    sortfield="clock",
                    sortorder="ASC",
                )
                points = [
                    {"clock": int(t["clock"]), "value": float(t["value_avg"])}
                    for t in trends
                ]
            else:
                # Periods ≤ 24 h: raw history.  Fetch DESC (most-recent first) so
                # the limit always discards the oldest points, never the newest.
                # Reverse the list before returning so the frontend gets ASC order.
                history = self.zapi.history.get(
                    itemids=[itemid],
                    history=value_type,
                    time_from=time_from,
                    time_till=time_till,
                    output=["clock", "value"],
                    sortfield="clock",
                    sortorder="DESC",
                    limit=5000,
                )
                points = [
                    {"clock": int(h["clock"]), "value": float(h["value"])}
                    for h in reversed(history)
                ]
            return {
                "history": points,
                "item_name": item["name"],
                "units": item.get("units", ""),
            }
        except Exception as e:
            print(f"❌ get_item_history failed: {repr(e)}")
            return {"history": [], "item_name": "", "units": ""}
