import asyncio
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Literal

import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from Alert_Manager import Alert_Manager
from Auth import (
    can_grant_roles,
    create_token,
    get_current_user,
    hash_password,
    require_admin,
    require_operator,
    require_root,
    verify_password,
)
from Dashboard_Manager import Dashboard_Manager
from Database import init_db, install_notify_triggers
from Host_Manager import Host_Manager
from Item_Manager import Item_Manager
from Metrics_Manager import Metrics_Manager
import User_Management as um
from ZabbixSync import ZabbixSync

logger = logging.getLogger(__name__)

# ── Managers ─────────────────────────────────────────────────────────
# Instantiated at module level; each manager handles Zabbix connection
# failures internally (sets self.zapi = None on error).
host_bot = Host_Manager()
item_bot = Item_Manager()
metrics_bot = Metrics_Manager()
dashboard_bot = Dashboard_Manager()
alert_bot = Alert_Manager()
sync_bot = ZabbixSync()

# ── SSE: real-time push to connected frontend clients ─────────────────
_sync_subscribers: set[asyncio.Queue[str]] = set()
_sync_lock = threading.Lock()
_event_loop: asyncio.AbstractEventLoop | None = None


# How often the background checker evaluates alert rules against the latest
# Zabbix values. Lower = alerts fire sooner after a threshold is breached, at
# the cost of more frequent Zabbix API + DB calls. The true floor on latency is
# the monitored item's own collection interval — the checker can't see a value
# Zabbix hasn't polled yet. Override with ALERT_CHECK_INTERVAL (seconds).
_ALERT_CHECK_INTERVAL = max(5, int(os.getenv("ALERT_CHECK_INTERVAL", "15")))


def _alert_loop() -> None:
    while True:
        try:
            alert_bot.run_checks()
        except Exception as exc:
            logger.error("Alert checker error: %r", exc)
        time.sleep(_ALERT_CHECK_INTERVAL)


def _notify_sync_clients() -> None:
    """Thread-safe: push a sync event to all SSE clients."""
    if not _event_loop:
        return
    with _sync_lock:
        queues = list(_sync_subscribers)
    for q in queues:
        _event_loop.call_soon_threadsafe(q.put_nowait, "sync")


def _sync_tags() -> None:
    try:
        for team in um.get_overview():
            team_name = team["name"]
            for hostname in team["hosts"]:
                host_bot.tag_host(hostname, team_name)
    except Exception as exc:
        logger.warning("Tag sync failed (non-fatal): %r", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _event_loop
    # Database — must come first
    init_db()
    install_notify_triggers()
    um.seed_root()
    # Zabbix user/team bootstrap
    sync_bot.pull_users()
    sync_bot.bootstrap_teams()
    # SSE event-loop reference
    _event_loop = asyncio.get_running_loop()
    # Alert checker background thread
    threading.Thread(target=_alert_loop, daemon=True, name="alert-checker").start()
    logger.info("Alert checker started (%s s interval).", _ALERT_CHECK_INTERVAL)
    # Real-time sync callbacks
    sync_bot._on_sync = _notify_sync_clients
    sync_bot.start_realtime_sync()
    sync_bot.start_background_sync()
    # Backfill host tags for assignments made before tagging was introduced
    _sync_tags()

    yield

    # Shutdown: close Zabbix sessions
    for bot in (host_bot, item_bot, metrics_bot, dashboard_bot, alert_bot, sync_bot):
        bot.close()


# ── App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Zabbix DevOps API",
    description="Manage Zabbix hosts and items via REST",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Request Schemas ───────────────────────────────────────────────────


class HostRequest(BaseModel):
    hostname: str
    ip: str
    template: str | None = "Linux by Zabbix agent"


class ItemRequest(BaseModel):
    hostname: str
    item_name: str
    item_key: str
    value_type: int | None = 3  # 3 = integer (most common)


class TriggerRequest(BaseModel):
    hostname: str
    item_key: str
    trigger_name: str
    threshold: float
    operator: Literal[">", ">=", "<", "<="] | None = ">"
    severity: int | None = 3


# ── Routes ────────────────────────────────────────────────────────────


@app.get("/health", tags=["Status"], summary="API Health Check")
def health():
    """Returns whether the API is up and connected to Zabbix."""
    return {"status": "online", "zabbix_connected": host_bot.zapi is not None}


@app.post("/sync", tags=["Status"], summary="Trigger full Zabbix sync now")
def trigger_sync(current_user: dict = Depends(require_root)):
    """Immediately runs a full bidirectional sync (users, groups, hosts).
    Normally runs automatically every ZABBIX_SYNC_INTERVAL seconds."""
    sync_bot.full_sync()
    return {"message": "Sync complete."}


@app.get(
    "/sync/debug/{team_name}", tags=["Status"], summary="Show Zabbix state for a team"
)
def debug_team_sync(team_name: str, current_user: dict = Depends(require_root)):
    """Returns the Zabbix user group, host group, permissions, and hosts for a team."""
    if not sync_bot.zapi:
        raise HTTPException(status_code=503, detail="Zabbix not connected.")
    result: dict = {"team": team_name}
    try:
        rights_param = (
            "selectHostGroupRights"
            if sync_bot._rights_field == "hostgroup_rights"
            else "selectRights"
        )
        ug = sync_bot.zapi.usergroup.get(
            filter={"name": team_name},
            output=["usrgrpid", "name"],
            **{rights_param: ["id", "permission"]},
        )
        result["user_group"] = ug[0] if ug else None
    except Exception as e:
        result["user_group_error"] = repr(e)
    try:
        hg = sync_bot.zapi.hostgroup.get(
            filter={"name": team_name},
            output=["groupid", "name"],
        )
        result["host_group"] = hg[0] if hg else None
        if hg:
            hosts_in_group = sync_bot.zapi.host.get(
                groupids=[hg[0]["groupid"]],
                output=["hostid", "host"],
            )
            result["hosts_in_group"] = hosts_in_group
    except Exception as e:
        result["host_group_error"] = repr(e)
    return result


@app.get("/events", tags=["Status"], summary="SSE stream for real-time sync events")
async def sse_events(request: Request, current_user: dict = Depends(get_current_user)):
    """Server-Sent Events stream. Sends 'data: sync' whenever a full_sync completes."""
    queue: asyncio.Queue[str] = asyncio.Queue()
    with _sync_lock:
        _sync_subscribers.add(queue)

    async def _stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"data: {event}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            with _sync_lock:
                _sync_subscribers.discard(queue)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/hosts", tags=["Hosts"], summary="List All Hosts")
def get_all_hosts(current_user: dict = Depends(get_current_user)):
    """Returns hosts from Zabbix. root and auditor see all; others see only their team's hosts."""
    all_hosts = host_bot.get_hosts()
    roles = current_user.get("roles", [])
    if "root" in roles or "auditor" in roles:
        return {"count": len(all_hosts), "hosts": all_hosts}
    team_id = current_user.get("team_id")
    if not team_id:
        return {"count": 0, "hosts": []}
    assigned = um.get_team_hostnames(team_id)
    hosts = [h for h in all_hosts if h["host"] in assigned]
    return {"count": len(hosts), "hosts": hosts}


@app.get("/hosts/download", tags=["Hosts"], summary="Download Host Inventory (.xlsx)")
def download_inventory():
    """Generates an Excel file of all hosts and triggers a download."""
    excel_bytes = host_bot.export_hosts_to_excel_bytes()
    if not excel_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate Excel file.")
    headers = {"Content-Disposition": 'attachment; filename="Zabbix_Inventory.xlsx"'}
    return StreamingResponse(
        content=iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.post("/hosts", tags=["Hosts"], summary="Create New Host", status_code=201)
def create_host(data: HostRequest, current_user: dict = Depends(require_operator)):
    """Creates a new Zabbix host. Auto-assigns to the creator's team if they have one."""
    result = host_bot.create_server(data.hostname, data.ip, template_name=data.template)
    if not result:
        raise HTTPException(
            status_code=400, detail="Failed to create host. Check logs."
        )
    team_id = current_user.get("team_id")
    if team_id:
        team_name = um.get_team_name(team_id)
        um.assign_host(team_id, data.hostname)
        if team_name:
            host_bot.tag_host(data.hostname, team_name)
    return {"message": "Host created successfully.", "hostid": result}


@app.post(
    "/hosts/bulk",
    tags=["Hosts"],
    summary="Bulk Create Hosts from CSV/XLSX",
    status_code=201,
)
async def bulk_create_hosts(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_operator),
):
    """Creates multiple hosts from a CSV/XLSX file with columns: hostname, ip, template(optional)."""
    filename = (file.filename or "").lower()
    if not filename.endswith((".csv", ".xlsx")):
        raise HTTPException(
            status_code=400, detail="Unsupported file type. Use .csv or .xlsx"
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to parse file: {exc}"
        ) from exc

    normalized = {str(c).strip().lower(): c for c in df.columns}
    hostname_col = normalized.get("hostname") or normalized.get("host")
    ip_col = normalized.get("ip") or normalized.get("ip_address")
    template_col = normalized.get("template")

    if not hostname_col or not ip_col:
        raise HTTPException(
            status_code=400,
            detail="File must contain hostname (or host) and ip (or ip_address) columns.",
        )

    created: list[dict] = []
    failed: list[dict] = []
    default_template = "Linux by Zabbix agent"

    for idx, row in df.iterrows():
        hostname = str(row.get(hostname_col, "")).strip()
        ip = str(row.get(ip_col, "")).strip()
        template = str(row.get(template_col, "")).strip() if template_col else ""
        if not hostname or hostname.lower() == "nan" or not ip or ip.lower() == "nan":
            failed.append({"row": int(idx) + 2, "reason": "Missing hostname/ip"})
            continue

        hostid = host_bot.create_server(
            hostname, ip, template_name=template or default_template
        )
        if hostid:
            created.append(
                {"row": int(idx) + 2, "hostname": hostname, "hostid": hostid}
            )
        else:
            failed.append(
                {
                    "row": int(idx) + 2,
                    "hostname": hostname,
                    "reason": "Zabbix create failed",
                }
            )

    return {
        "message": "Bulk host import completed.",
        "total_rows": int(len(df)),
        "created_count": len(created),
        "failed_count": len(failed),
        "created": created,
        "failed": failed,
    }


@app.delete("/hosts/{hostname}", tags=["Hosts"], summary="Delete Host")
def delete_host(hostname: str, current_user: dict = Depends(require_operator)):
    """Deletes a host from Zabbix. team_lead and operator can only delete hosts in their own team."""
    if "root" not in current_user.get("roles", []):
        team_id = current_user.get("team_id")
        if not team_id or hostname not in um.get_team_hostnames(team_id):
            raise HTTPException(
                status_code=403,
                detail="You can only delete hosts assigned to your own team.",
            )
    um.unassign_host(hostname)
    success = host_bot.delete_server(hostname)
    if not success:
        raise HTTPException(
            status_code=404, detail=f"Host '{hostname}' not found or deletion failed."
        )
    return {"message": f"Host '{hostname}' deleted successfully."}


@app.get("/items/{hostname}", tags=["Items"], summary="List items for a host")
def list_items(
    hostname: str,
    include_inherited: bool = False,
    current_user: dict = Depends(get_current_user),
):
    return {"items": item_bot.list_items(hostname, include_inherited=include_inherited)}


@app.delete("/items/{itemid}", tags=["Items"], summary="Delete item by ID")
def delete_item(itemid: str, current_user: dict = Depends(require_operator)):
    if not item_bot.delete_item(itemid):
        raise HTTPException(
            status_code=404, detail="Item not found or could not be deleted."
        )
    return {"message": "Item deleted."}


@app.get("/triggers/{hostname}", tags=["Triggers"], summary="List triggers for a host")
def list_triggers(hostname: str, current_user: dict = Depends(get_current_user)):
    return {"triggers": item_bot.list_triggers(hostname)}


@app.delete("/triggers/{triggerid}", tags=["Triggers"], summary="Delete trigger by ID")
def delete_trigger(triggerid: str, current_user: dict = Depends(require_operator)):
    if not item_bot.delete_trigger(triggerid):
        raise HTTPException(
            status_code=404, detail="Trigger not found or could not be deleted."
        )
    return {"message": "Trigger deleted."}


@app.get("/metrics/problems", tags=["Metrics"], summary="Active Zabbix problems")
def get_problems(current_user: dict = Depends(get_current_user)):
    return {"problems": metrics_bot.get_problems()}


@app.post(
    "/metrics/problems/{eventid}/acknowledge",
    tags=["Metrics"],
    summary="Acknowledge a Zabbix problem",
)
def acknowledge_problem(
    eventid: str,
    current_user: dict = Depends(get_current_user),
):
    if not metrics_bot.acknowledge_problem(eventid):
        raise HTTPException(status_code=503, detail="Zabbix not connected or acknowledge failed.")
    return {"message": "Problem acknowledged."}


@app.get(
    "/metrics/history/{itemid}", tags=["Metrics"], summary="Item history time-series"
)
def get_item_history(
    itemid: str,
    minutes: int = 360,
    current_user: dict = Depends(get_current_user),
):
    if minutes < 1 or minutes > 10080:
        raise HTTPException(
            status_code=400, detail="minutes must be between 1 and 10080"
        )
    return metrics_bot.get_item_history(itemid, minutes)


@app.post("/items", tags=["Items"], summary="Add Monitoring Item", status_code=201)
def add_item(data: ItemRequest, current_user: dict = Depends(require_operator)):
    """Adds a monitoring item (metric) to an existing host."""
    team_id = current_user.get("team_id")
    team_name = um.get_team_name(team_id) if team_id else None
    result = item_bot.add_item(
        data.hostname, data.item_name, data.item_key, data.value_type, team_name or ""
    )
    if not result:
        raise HTTPException(
            status_code=400, detail="Failed to add item. Check host name and key."
        )
    return {"message": "Item added successfully.", "itemid": result}


@app.post(
    "/triggers", tags=["Triggers"], summary="Add Trigger to Item", status_code=201
)
def add_trigger(data: TriggerRequest, current_user: dict = Depends(require_operator)):
    """Adds a trigger to an existing host item."""
    result = item_bot.add_trigger(
        hostname=data.hostname,
        item_key=data.item_key,
        trigger_name=data.trigger_name,
        threshold=data.threshold,
        operator=data.operator or ">",
        priority=data.severity or 3,
    )
    if not result:
        raise HTTPException(
            status_code=400,
            detail="Failed to add trigger. Check host, item key, operator, and threshold.",
        )
    return {"message": "Trigger added successfully.", "triggerid": result}


# ── Dashboard routes ──────────────────────────────────────────────────


@app.get("/dashboard/graphs", tags=["Dashboard"], summary="List Zabbix graphs")
def list_graphs(
    hostid: str | None = None, current_user: dict = Depends(get_current_user)
):
    return {"graphs": dashboard_bot.get_graphs(hostid)}


@app.get(
    "/dashboard/graphs/{graphid}/image",
    tags=["Dashboard"],
    summary="Proxy native Zabbix graph image",
)
def get_graph_image(
    graphid: str,
    period: int = 3600,
    width: int = 900,
    height: int = 200,
    current_user: dict = Depends(get_current_user),
):
    img = dashboard_bot.get_graph_image(graphid, period, width, height)
    if not img:
        raise HTTPException(
            status_code=503, detail="Graph image unavailable — check Zabbix web session"
        )
    return Response(content=img, media_type="image/png")


@app.get(
    "/dashboard/graphs/{graphid}/data",
    tags=["Dashboard"],
    summary="Chart.js data for a graph",
)
def get_graph_data(
    graphid: str,
    minutes: int = 360,
    current_user: dict = Depends(get_current_user),
):
    if minutes < 1 or minutes > 10080:
        raise HTTPException(
            status_code=400, detail="minutes must be between 1 and 10080"
        )
    return dashboard_bot.get_graph_data(graphid, minutes)


@app.get(
    "/dashboard/hosts/metrics",
    tags=["Dashboard"],
    summary="Last metric values for all hosts",
)
def get_hosts_metrics(current_user: dict = Depends(get_current_user)):
    return {"hosts": dashboard_bot.get_hosts_metrics()}


@app.get(
    "/dashboard/items/recent", tags=["Dashboard"], summary="Recently created items"
)
def get_recent_items(limit: int = 30, current_user: dict = Depends(get_current_user)):
    return {"items": dashboard_bot.get_recent_items(min(limit, 100))}


class DashboardLayoutRequest(BaseModel):
    scope: str
    widgets: list[dict]


@app.get("/dashboard/layout", tags=["Dashboard"], summary="Get saved dashboard layout")
def get_dashboard_layout(
    scope: str = "user",
    page: str = "dashboard",
    current_user: dict = Depends(get_current_user),
):
    if scope == "team":
        team_id = current_user.get("team_id")
        if not team_id:
            return {"widgets": [], "scope": "team"}
        return {
            "widgets": um.get_dashboard_layout("team", int(team_id), page),
            "scope": "team",
        }
    user_id = int(current_user.get("sub", 0))
    return {"widgets": um.get_dashboard_layout("user", user_id, page), "scope": "user"}


@app.put("/dashboard/layout", tags=["Dashboard"], summary="Save dashboard layout")
def save_dashboard_layout(
    data: DashboardLayoutRequest,
    page: str = "dashboard",
    current_user: dict = Depends(get_current_user),
):
    if data.scope not in ("user", "team"):
        raise HTTPException(status_code=400, detail="scope must be 'user' or 'team'")
    if data.scope == "team":
        team_id = current_user.get("team_id")
        if not team_id:
            raise HTTPException(status_code=400, detail="You are not in a team.")
        if not um.save_dashboard_layout("team", int(team_id), data.widgets, page):
            raise HTTPException(status_code=500, detail="Failed to save layout.")
    else:
        user_id = int(current_user.get("sub", 0))
        if not um.save_dashboard_layout("user", user_id, data.widgets, page):
            raise HTTPException(status_code=500, detail="Failed to save layout.")
    return {"message": "Layout saved."}


# ── Auth / Teams / Users schemas ──────────────────────────────────────


class LoginRequest(BaseModel):
    username: str
    password: str


class TeamRequest(BaseModel):
    name: str
    description: str | None = ""


class UserRequest(BaseModel):
    username: str
    password: str
    email: str | None = ""
    roles: list[str] = Field(default_factory=lambda: ["member"])
    team_id: int | None = None


class HostAssignRequest(BaseModel):
    hostname: str


class PasswordChangeRequest(BaseModel):
    new_password: str


class UserUpdateRequest(BaseModel):
    roles: list[str]
    team_id: int | None = None


# ── Auth routes ───────────────────────────────────────────────────────


@app.post("/auth/login", tags=["Auth"], summary="Login")
def login(data: LoginRequest):
    user = um.get_user_by_username(data.username)
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_token(user["id"], user["username"], user["roles"], user["team_id"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "roles": user["roles"],
            "team_id": user["team_id"],
        },
    }


@app.get("/auth/me", tags=["Auth"], summary="Current user")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ── Teams routes ──────────────────────────────────────────────────────


@app.get("/teams/overview", tags=["Teams"], summary="Teams with members and hosts")
def teams_overview(current_user: dict = Depends(get_current_user)):
    # root and auditor see all teams; everyone else sees only their own
    roles = current_user.get("roles", [])
    team_filter = (
        None if ("root" in roles or "auditor" in roles) else current_user.get("team_id")
    )
    return {"teams": um.get_overview(team_id=team_filter)}


@app.get("/teams", tags=["Teams"], summary="List teams")
def list_teams(current_user: dict = Depends(get_current_user)):
    return {"teams": um.list_teams()}


@app.post("/teams", tags=["Teams"], summary="Create team", status_code=201)
def create_team(data: TeamRequest, current_user: dict = Depends(require_root)):
    result = um.create_team(data.name, data.description or "")
    if not result:
        raise HTTPException(
            status_code=400, detail="Failed to create team. Name may already exist."
        )
    sync_bot.push_team(data.name)
    return result


@app.delete("/teams/{team_id}", tags=["Teams"], summary="Delete team")
def delete_team(team_id: int, current_user: dict = Depends(require_root)):
    team_name = um.get_team_name(team_id)
    if not um.delete_team(team_id):
        raise HTTPException(status_code=404, detail="Team not found.")
    if team_name:
        sync_bot.delete_team(team_name)
    return {"message": "Team deleted."}


@app.post(
    "/teams/{team_id}/hosts",
    tags=["Teams"],
    summary="Assign host to team",
    status_code=201,
)
def assign_host(
    team_id: int, data: HostAssignRequest, current_user: dict = Depends(require_admin)
):
    if (
        "root" not in current_user.get("roles", [])
        and current_user.get("team_id") != team_id
    ):
        raise HTTPException(
            status_code=403, detail="You can only assign hosts to your own team."
        )
    if not um.assign_host(team_id, data.hostname):
        raise HTTPException(status_code=400, detail="Failed to assign host.")
    team_name = um.get_team_name(team_id)
    if team_name:
        host_bot.tag_host(data.hostname, team_name)
        sync_bot.push_host_to_team(data.hostname, team_name)
    return {"message": "Host assigned."}


@app.delete(
    "/teams/{team_id}/hosts/{hostname}", tags=["Teams"], summary="Remove host from team"
)
def unassign_host(
    team_id: int, hostname: str, current_user: dict = Depends(require_admin)
):
    if (
        "root" not in current_user.get("roles", [])
        and current_user.get("team_id") != team_id
    ):
        raise HTTPException(
            status_code=403, detail="You can only remove hosts from your own team."
        )
    team_name = um.get_team_name(team_id)
    if not um.unassign_host(hostname):
        raise HTTPException(status_code=404, detail="Host assignment not found.")
    host_bot.untag_host(hostname)
    if team_name:
        sync_bot.remove_host_from_team(hostname, team_name)
    return {"message": "Host removed from team."}


# ── Users routes ──────────────────────────────────────────────────────


@app.get("/users", tags=["Users"], summary="List users")
def list_users(current_user: dict = Depends(require_admin)):
    """root sees all users; team_lead sees only users in their own team."""
    if "root" in current_user.get("roles", []):
        return {"users": um.list_users()}
    team_id = current_user.get("team_id")
    if not team_id:
        return {"users": []}
    return {"users": um.list_users(team_id=team_id)}


@app.put("/users/{user_id}", tags=["Users"], summary="Update user roles and team")
def update_user(
    user_id: int, data: UserUpdateRequest, current_user: dict = Depends(require_admin)
):
    target = um.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if "root" not in current_user.get("roles", []) and target.get(
        "team_id"
    ) != current_user.get("team_id"):
        raise HTTPException(
            status_code=403, detail="You can only edit users in your own team."
        )
    if not can_grant_roles(current_user.get("roles", []), data.roles):
        raise HTTPException(
            status_code=403, detail="You cannot assign roles higher than your own."
        )
    if not um.update_user_profile(user_id, data.roles, data.team_id):
        raise HTTPException(status_code=400, detail="Failed to update user.")
    team_name = um.get_team_name(data.team_id) if data.team_id else None
    sync_bot.push_user(target["username"], "", data.roles, team_name)
    return {"message": "User updated."}


@app.post("/users", tags=["Teams"], summary="Create user", status_code=201)
def create_user(data: UserRequest, current_user: dict = Depends(require_admin)):
    if len(data.password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters long."
        )
    if "root" not in current_user.get("roles", []) and data.team_id != current_user.get(
        "team_id"
    ):
        raise HTTPException(
            status_code=403, detail="You can only create users in your own team."
        )
    if not can_grant_roles(current_user.get("roles", []), data.roles or ["member"]):
        raise HTTPException(
            status_code=403, detail="You cannot assign roles higher than your own."
        )
    roles = data.roles or ["member"]
    result = um.create_user(
        data.username,
        hash_password(data.password),
        data.email or "",
        roles,
        data.team_id,
    )
    if not result:
        raise HTTPException(
            status_code=400, detail="Failed to create user. Username may already exist."
        )
    team_name = um.get_team_name(data.team_id) if data.team_id else None
    sync_bot.push_user(data.username, data.password, roles, team_name)
    return result


@app.put("/users/{user_id}/password", tags=["Teams"], summary="Change user password")
def change_password(
    user_id: int,
    data: PasswordChangeRequest,
    current_user: dict = Depends(require_admin),
):
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters long."
        )
    target = um.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if "root" not in current_user.get("roles", []) and target.get(
        "team_id"
    ) != current_user.get("team_id"):
        raise HTTPException(
            status_code=403,
            detail="You can only change passwords for users in your own team.",
        )
    if not um.update_password(user_id, hash_password(data.new_password)):
        raise HTTPException(status_code=400, detail="Failed to update password.")
    sync_bot.update_password(target["username"], data.new_password)
    return {"message": "Password updated."}


@app.delete("/users/{user_id}", tags=["Teams"], summary="Delete user")
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    target = um.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if "root" not in current_user.get("roles", []) and target.get(
        "team_id"
    ) != current_user.get("team_id"):
        raise HTTPException(
            status_code=403, detail="You can only delete users in your own team."
        )
    if not um.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found.")
    sync_bot.delete_user(target["username"])
    return {"message": "User deleted."}


# ── Alert rules ───────────────────────────────────────────────────────

class AlertRuleCreate(BaseModel):
    item_id: str
    item_name: str
    hostname: str
    operator: str
    threshold: float
    severity: int = 2


@app.get("/alerts/rules", tags=["Alerts"], summary="List alert rules for current user")
def list_alert_rules(current_user: dict = Depends(get_current_user)):
    return {"rules": alert_bot.get_rules(int(current_user["sub"]))}


@app.post("/alerts/rules", tags=["Alerts"], summary="Create alert rule", status_code=201)
def create_alert_rule(data: AlertRuleCreate, current_user: dict = Depends(get_current_user)):
    if data.operator not in (">", "<", ">=", "<="):
        raise HTTPException(status_code=400, detail="operator must be >, <, >=, or <=")
    if not (0 <= data.severity <= 5):
        raise HTTPException(status_code=400, detail="severity must be 0–5")
    result = alert_bot.create_rule(
        int(current_user["sub"]), data.item_id, data.item_name,
        data.hostname, data.operator, data.threshold, data.severity,
    )
    return result


@app.delete("/alerts/rules/{rule_id}", tags=["Alerts"], summary="Delete alert rule")
def delete_alert_rule(rule_id: int, current_user: dict = Depends(get_current_user)):
    if not alert_bot.delete_rule(rule_id, int(current_user["sub"])):
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"message": "Rule deleted."}


@app.patch("/alerts/rules/{rule_id}/toggle", tags=["Alerts"], summary="Enable/disable alert rule")
def toggle_alert_rule(rule_id: int, current_user: dict = Depends(get_current_user)):
    result = alert_bot.toggle_rule(rule_id, int(current_user["sub"]))
    if result is None:
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"enabled": result}


@app.get("/alerts/events", tags=["Alerts"], summary="Recent alert events for current user")
def get_alert_events(
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    clamped = max(1, min(limit, 500))
    return {"events": alert_bot.get_events(int(current_user["sub"]), limit=clamped)}


# ── Runner ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=6769)
