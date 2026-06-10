import asyncio
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Literal

import pandas as pd
from fastapi import Body, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

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
from Database import get_conn, init_db, install_notify_triggers
from Host_Manager import Host_Manager
from Item_Manager import Item_Manager
from Metrics_Manager import Metrics_Manager
import User_Management as um
from ZabbixSync import ZabbixSync

logger = logging.getLogger(__name__)

# ── Logging configuration ─────────────────────────────────────────────
_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _log_level, logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# /health is polled every 15 s — suppress its access log to avoid noise
logging.getLogger("uvicorn.access").addFilter(
    type("_HealthFilter", (logging.Filter,), {
        "filter": lambda self, r: "/health" not in r.getMessage()
    })()
)

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
_limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Zabbix DevOps API",
    description="Manage Zabbix hosts and items via REST",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = _limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — reads ALLOWED_ORIGINS from env (ConfigMap in OC, .env locally).
# Local Docker:   ALLOWED_ORIGINS=http://localhost:42069   (port required — non-standard)
# OpenShift:      ALLOWED_ORIGINS=https://your-frontend-route.apps.cluster.example.com  (no port — Route uses 443)
# Multiple:       comma-separated, e.g. "https://staging.example.com,https://prod.example.com"
# Defaults to "*" when the variable is not set (local dev without strict CORS).
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _log_requests(request: Request, call_next):
    """Log every request with method, path, status code, and duration. Skip /health."""
    if request.url.path == "/health":
        return await call_next(request)
    t0 = time.monotonic()
    response = await call_next(request)
    ms = (time.monotonic() - t0) * 1000
    logger.info(
        "%s %s → %d (%.0f ms)",
        request.method, request.url.path, response.status_code, ms,
    )
    return response


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


class HttpItemRequest(BaseModel):
    hostname: str
    item_name: str
    url: str
    item_key: str = ""
    request_method: int = 0       # 0=GET 1=POST 2=PUT 3=HEAD
    status_codes: str = "200"
    timeout: str = "15s"
    verify_peer: bool = True
    follow_redirects: bool = True
    posts: str = ""
    value_type: int = 3           # 3=integer (code), 0=float (time), 4=text (body)
    team_name: str = ""
    # authentication
    authtype: int = 0             # 0=None, 1=Basic, 2=NTLM
    username: str = ""
    password: str = ""
    # regex preprocessing
    regex_preprocessing: bool = False
    regex_pattern: str = ""
    regex_output: str = "\\1"     # first capture group by default
    regex_no_match_value: str = "0"


class ServiceItemRequest(BaseModel):
    hostname: str
    service_type: str             # icmp_ping|icmp_loss|icmp_time|http|https|ssh|smtp|ftp|tcp_port
    port: int | None = None
    item_name: str = ""
    team_name: str = ""


class FileWatchRequest(BaseModel):
    hostname: str
    file_path: str
    check_type: str = "checksum"  # checksum | mtime | size | exists | folder_latest
    item_name: str = ""
    team_name: str = ""
    folder_os: str = "linux"      # linux | windows  (folder_latest only)
    create_trigger: bool = True
    trigger_name: str = ""
    trigger_priority: int = 2
    trigger_type: str = "change"  # change | age
    max_age_minutes: int = 60     # used when trigger_type = "age"


class ScriptItemRequest(BaseModel):
    hostname: str
    script_type: str = "bash"     # bash | powershell
    script_mode: str = "command"  # command | file
    script: str                   # inline command or absolute script path on host
    file_arg: str = ""            # optional file argument passed to the script
    item_name: str = ""
    value_type: int = 1           # 1=string default for script output
    team_name: str = ""


class BulkItemRequest(BaseModel):
    hostnames: list[str]
    item_type: str = "agent"      # agent | http | service | script
    item_name: str = ""
    item_key: str = ""
    value_type: int = 3
    url: str = ""
    request_method: int = 0
    status_codes: str = "200"
    timeout: str = "15s"
    verify_peer: bool = True
    follow_redirects: bool = True
    posts: str = ""
    service_type: str = ""
    port: int | None = None
    # http auth fields
    authtype: int = 0
    username: str = ""
    password: str = ""
    regex_preprocessing: bool = False
    regex_pattern: str = ""
    regex_output: str = "\\1"
    regex_no_match_value: str = "0"
    # script fields
    script_type: str = "bash"
    script_mode: str = "command"
    script: str = ""
    file_arg: str = ""
    team_name: str = ""


class BulkTriggerRequest(BaseModel):
    hostnames: list[str]
    item_key: str
    trigger_name: str
    threshold: float
    operator: Literal[">", ">=", "<", "<="] | None = ">"
    priority: int = 3


class AcknowledgeRequest(BaseModel):
    problem_name: str = ""
    hostname: str = ""
    severity: int = 0
    note: str = ""


class HostTagItem(BaseModel):
    tag: str
    value: str = ""


class TagsUpdateRequest(BaseModel):
    tags: list[HostTagItem]


class DbOdbcRequest(BaseModel):
    hostname: str
    dsn: str
    sql_query: str
    description: str
    item_name: str = ""
    value_type: int = 3
    username: str = ""
    password: str = ""


class DbAgent2Request(BaseModel):
    hostname: str
    engine: str
    conn_string: str
    metric: str
    extra_param: str = ""
    item_name: str = ""
    value_type: int | None = None


# ── Routes ────────────────────────────────────────────────────────────


def _live_team_id(current_user: dict) -> int | None:
    """Re-fetch team_id from the DB so stale JWTs (minted before a team change) still work."""
    try:
        user_id = int(current_user.get("sub", 0))
        live = um.get_user_by_id(user_id) if user_id else None
        return (live.get("team_id") if live else None) or current_user.get("team_id")
    except Exception:
        return current_user.get("team_id")


def _team_hostname_filter(current_user: dict) -> set[str] | None:
    """Return the set of hostnames visible to this user.
    Returns None for root/auditor (no restriction).
    Returns an empty set when the user has no team assignment.
    """
    roles = current_user.get("roles", [])
    if any(r in roles for r in ("root", "auditor")):
        return None
    team_id = _live_team_id(current_user)
    if not team_id:
        return set()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT hostname FROM host_assignments WHERE team_id = %s",
                (team_id,),
            )
            return {row["hostname"] for row in cur.fetchall()}
    finally:
        conn.close()


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
    team_id = _live_team_id(current_user)
    if not team_id:
        return {"count": 0, "hosts": []}
    team_name = um.get_team_name(team_id)
    assigned = um.get_team_hostnames(team_id)
    # A host is visible if the DB assignment OR the Zabbix team tag matches
    def _in_team(h: dict) -> bool:
        if h["host"] in assigned:
            return True
        if team_name:
            return any(t.get("tag") == "team" and t.get("value") == team_name for t in h.get("tags", []))
        return False
    hosts = [h for h in all_hosts if _in_team(h)]
    return {"count": len(hosts), "hosts": hosts}


@app.get("/hosts/download", tags=["Hosts"], summary="Download Host Inventory (.xlsx)")
def download_inventory(current_user: dict = Depends(get_current_user)):
    """Generates an Excel file of the hosts visible to the current user."""
    allowed = _team_hostname_filter(current_user)
    excel_bytes = host_bot.export_hosts_to_excel_bytes(hostname_filter=allowed)
    if not excel_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate Excel file.")
    headers = {"Content-Disposition": 'attachment; filename="Zabbix_Inventory.xlsx"'}
    return StreamingResponse(
        content=iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.get("/templates", tags=["Hosts"], summary="List available Zabbix templates")
def list_templates(current_user: dict = Depends(get_current_user)):
    """Returns all templates from Zabbix sorted by name."""
    return {"templates": host_bot.list_templates()}


@app.post("/hosts", tags=["Hosts"], summary="Create New Host", status_code=201)
def create_host(data: HostRequest, current_user: dict = Depends(require_operator)):
    """Creates a new Zabbix host. Auto-assigns to the creator's team if they have one."""
    result = host_bot.create_server(data.hostname, data.ip, template_name=data.template)
    if not result:
        raise HTTPException(
            status_code=400, detail="Failed to create host. Check logs."
        )
    team_id = _live_team_id(current_user)
    if team_id:
        team_name = um.get_team_name(team_id)
        if not um.assign_host(team_id, data.hostname):
            logger.warning("assign_host failed for %r team_id=%s", data.hostname, team_id)
        if team_name:
            host_bot.tag_host(data.hostname, team_name)
            # Add to the team's Zabbix host group so the team user can see it in Zabbix
            host_bot.add_host_to_hostgroup(data.hostname, team_name)
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
    if len(content) > 10 * 1024 * 1024:  # 10 MB hard limit
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))
    except Exception as exc:
        logger.error("Bulk upload: failed to parse file %r: %r", file.filename, exc)
        raise HTTPException(
            status_code=400, detail="Failed to parse file. Ensure it is a valid CSV or XLSX."
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
        team_id = _live_team_id(current_user)
        if not team_id:
            raise HTTPException(
                status_code=403,
                detail="You can only delete hosts assigned to your own team.",
            )
        # Check ownership via DB assignment OR Zabbix team tag
        in_db = hostname in um.get_team_hostnames(team_id)
        if not in_db:
            team_name = um.get_team_name(team_id)
            in_zabbix = team_name and host_bot.get_host_team(hostname) == team_name
            if not in_zabbix:
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


@app.put("/hosts/{hostname}/tags", tags=["Hosts"], summary="Update custom tags on a host")
def update_host_tags(
    hostname: str,
    body: TagsUpdateRequest,
    current_user: dict = Depends(require_operator),
):
    """Replace all non-team tags on a host. The 'team' tag is preserved automatically."""
    allowed = _team_hostname_filter(current_user)
    if allowed is not None and hostname not in allowed:
        raise HTTPException(status_code=403, detail="Host not in your team.")
    payload = [{"tag": t.tag, "value": t.value} for t in body.tags]
    ok, err = host_bot.update_host_tags(hostname, payload)
    if not ok:
        raise HTTPException(status_code=400, detail=err or "Failed to update tags.")
    return {"message": "Tags updated."}


@app.get("/items/keys", tags=["Items"], summary="List all item keys from Zabbix templates")
def list_item_keys(current_user: dict = Depends(get_current_user)):
    return {"items": item_bot.get_all_item_keys()}


@app.get("/items/{hostname}", tags=["Items"], summary="List items for a host")
def list_items(
    hostname: str,
    include_inherited: bool = False,
    current_user: dict = Depends(get_current_user),
):
    allowed = _team_hostname_filter(current_user)
    if allowed is not None and hostname not in allowed:
        raise HTTPException(status_code=403, detail="Host not assigned to your team.")
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
    allowed = _team_hostname_filter(current_user)
    if allowed is not None and hostname not in allowed:
        raise HTTPException(status_code=403, detail="Host not assigned to your team.")
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
    problems = metrics_bot.get_problems()
    if not problems:
        return {"problems": problems}

    # root and auditor see all problems; everyone else sees only their team's hosts.
    allowed = _team_hostname_filter(current_user)
    if allowed is not None:
        problems = [p for p in problems if p["hostname"] in allowed]

    if not problems:
        return {"problems": problems}

    # Enrich acknowledged problems with who/when/note from our DB.
    acked_ids = [p["eventid"] for p in problems if p["acknowledged"]]
    if acked_ids:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT DISTINCT ON (eventid) eventid, acknowledged_by, acked_at, note
                       FROM problem_acknowledgements
                       WHERE eventid = ANY(%s)
                       ORDER BY eventid, acked_at DESC""",
                    (acked_ids,),
                )
                ack_map = {
                    row["eventid"]: {
                        "ack_user": row["acknowledged_by"],
                        "ack_time": row["acked_at"].isoformat(),
                        "ack_note": row["note"],
                    }
                    for row in cur.fetchall()
                }
        finally:
            conn.close()
        for p in problems:
            if p["eventid"] in ack_map:
                p.update(ack_map[p["eventid"]])
    return {"problems": problems}


@app.post(
    "/metrics/problems/{eventid}/acknowledge",
    tags=["Metrics"],
    summary="Acknowledge a Zabbix problem",
)
def acknowledge_problem(
    eventid: str,
    body: AcknowledgeRequest = Body(default_factory=AcknowledgeRequest),
    current_user: dict = Depends(get_current_user),
):
    roles = current_user.get("roles", [])
    if "root" not in roles and body.hostname:
        user_team_id = _live_team_id(current_user)
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT team_id FROM host_assignments WHERE hostname = %s LIMIT 1",
                    (body.hostname,),
                )
                row = cur.fetchone()
        finally:
            conn.close()
        if row is not None and row["team_id"] != user_team_id:
            raise HTTPException(
                status_code=403,
                detail="You can only acknowledge problems for hosts assigned to your team.",
            )

    username = current_user.get("username", "unknown")
    if not metrics_bot.acknowledge_problem(eventid, username=username, note=body.note):
        raise HTTPException(status_code=503, detail="Zabbix not connected or acknowledge failed.")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO problem_acknowledgements
                       (eventid, problem_name, hostname, severity, acknowledged_by, note)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (eventid, body.problem_name, body.hostname, body.severity, username, body.note),
            )
            conn.commit()
    finally:
        conn.close()
    logger.info("Problem %s acknowledged by %s.", eventid, username)
    return {"message": "Problem acknowledged.", "acknowledged_by": username}


@app.get("/metrics/acknowledgements", tags=["Metrics"], summary="Acknowledgement audit log")
def list_acknowledgements(
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    allowed = _team_hostname_filter(current_user)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if allowed is None:
                cur.execute(
                    """SELECT id, eventid, problem_name, hostname, severity,
                              acknowledged_by, note, acked_at
                       FROM problem_acknowledgements
                       ORDER BY acked_at DESC LIMIT %s""",
                    (limit,),
                )
            else:
                team_id = _live_team_id(current_user)
                team_usernames: list[str] = []
                if team_id:
                    cur.execute(
                        "SELECT username FROM team_users WHERE team_id = %s",
                        (team_id,),
                    )
                    team_usernames = [row["username"] for row in cur.fetchall()]
                cur.execute(
                    """SELECT id, eventid, problem_name, hostname, severity,
                              acknowledged_by, note, acked_at
                       FROM problem_acknowledgements
                       WHERE hostname = ANY(%s) OR acknowledged_by = ANY(%s)
                       ORDER BY acked_at DESC LIMIT %s""",
                    (list(allowed), team_usernames, limit),
                )
            rows = cur.fetchall()
    finally:
        conn.close()
    return {
        "acknowledgements": [
            {
                "id": r["id"], "eventid": r["eventid"], "problem_name": r["problem_name"],
                "hostname": r["hostname"], "severity": r["severity"], "acknowledged_by": r["acknowledged_by"],
                "note": r["note"], "acked_at": r["acked_at"].isoformat(),
            }
            for r in rows
        ]
    }


@app.get("/metrics/problems/history", tags=["Metrics"], summary="Historical problems in a time window")
def get_problem_history(
    hours: int = Query(24, ge=1, le=720),
    severity_min: int = Query(0, ge=0, le=5),
    limit: int = Query(500, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
):
    """Return historical Zabbix problems (active + resolved) for the given window.
    Team-isolated — root/auditor see all hosts, others see only their team.
    """
    allowed = _team_hostname_filter(current_user)
    return {
        "problems": metrics_bot.get_problem_history(
            hours=hours,
            hostname_filter=allowed,
            severity_min=severity_min,
            limit=limit,
        )
    }


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
    logger.debug("history request: item=%s minutes=%d", itemid, minutes)
    return metrics_bot.get_item_history(itemid, minutes)


@app.post("/items", tags=["Items"], summary="Add Monitoring Item", status_code=201)
def add_item(data: ItemRequest, current_user: dict = Depends(require_operator)):
    """Adds a monitoring item (metric) to an existing host."""
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else None
    item_id, err = item_bot.add_item(
        data.hostname, data.item_name, data.item_key, data.value_type, team_name or ""
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add item.")
    return {"message": "Item added successfully.", "itemid": item_id}


@app.post(
    "/triggers", tags=["Triggers"], summary="Add Trigger to Item", status_code=201
)
def add_trigger(data: TriggerRequest, current_user: dict = Depends(require_operator)):
    """Adds a trigger to an existing host item."""
    trigger_id, err = item_bot.add_trigger(
        hostname=data.hostname,
        item_key=data.item_key,
        trigger_name=data.trigger_name,
        threshold=data.threshold,
        operator=data.operator or ">",
        priority=data.severity or 3,
    )
    if not trigger_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add trigger.")
    return {"message": "Trigger added successfully.", "triggerid": trigger_id}


@app.post("/items/http", tags=["Items"], summary="Add HTTP Agent Item", status_code=201)
def add_http_item(data: HttpItemRequest, current_user: dict = Depends(require_operator)):
    """Adds an HTTP agent item (type 19). Zabbix server fetches the URL and stores the result."""
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else None
    item_id, err = item_bot.add_http_item(
        hostname=data.hostname, item_name=data.item_name, url=data.url,
        item_key=data.item_key, request_method=data.request_method,
        status_codes=data.status_codes, timeout=data.timeout,
        verify_peer=data.verify_peer, follow_redirects=data.follow_redirects,
        posts=data.posts, value_type=data.value_type,
        team_name=team_name or data.team_name,
        authtype=data.authtype, username=data.username, password=data.password,
        regex_preprocessing=data.regex_preprocessing, regex_pattern=data.regex_pattern,
        regex_output=data.regex_output, regex_no_match_value=data.regex_no_match_value,
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add HTTP item.")
    return {"message": "HTTP item added successfully.", "itemid": item_id}


@app.post("/items/service", tags=["Items"], summary="Add Service Check Item", status_code=201)
def add_service_item(data: ServiceItemRequest, current_user: dict = Depends(require_operator)):
    """Adds a simple-check service item (type 3): ICMP ping, TCP port, HTTP/HTTPS/SSH/SMTP/FTP."""
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else None
    item_id, err = item_bot.add_service_item(
        hostname=data.hostname, service_type=data.service_type,
        port=data.port, item_name=data.item_name,
        team_name=team_name or data.team_name,
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add service item.")
    return {"message": "Service item added successfully.", "itemid": item_id}


@app.post("/items/filewatch", tags=["Items"], summary="Add File Watch Item", status_code=201)
def add_file_watch_item(data: FileWatchRequest, current_user: dict = Depends(require_operator)):
    """Creates an agent item that monitors a file property.
    Optionally auto-creates a change-detection trigger on the same item.
    """
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else None
    item_id, err = item_bot.add_file_watch_item(
        hostname=data.hostname,
        file_path=data.file_path,
        check_type=data.check_type,
        item_name=data.item_name,
        team_name=team_name or data.team_name,
        folder_os=data.folder_os,
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add file watch item.")

    trigger_id = None
    trigger_err = None
    # folder_latest returns a string filename — only change triggers make sense for it
    supports_age_trigger = data.check_type == "mtime"
    if data.create_trigger and data.check_type != "folder_latest":
        if data.trigger_type == "age" and supports_age_trigger:
            trigger_name = data.trigger_name or f"File not updated in {data.max_age_minutes}m: {data.file_path} on {{HOST.NAME}}"
            trigger_id, trigger_err = item_bot.add_file_age_trigger(
                hostname=data.hostname,
                file_path=data.file_path,
                trigger_name=trigger_name,
                max_age_minutes=data.max_age_minutes,
                priority=data.trigger_priority,
            )
        else:
            key_map = {
                "checksum": f"vfs.file.md5sum[{data.file_path}]",
                "mtime":    f"vfs.file.time[{data.file_path},modify]",
                "size":     f"vfs.file.size[{data.file_path}]",
                "exists":   f"vfs.file.exists[{data.file_path}]",
            }
            item_key = key_map.get(data.check_type, "")
            trigger_name = data.trigger_name or f"File changed: {data.file_path} on {{HOST.NAME}}"
            trigger_id, trigger_err = item_bot.add_change_trigger(
                hostname=data.hostname,
                item_key=item_key,
                trigger_name=trigger_name,
                priority=data.trigger_priority,
            )

    return {
        "message": "File watch item added successfully.",
        "itemid": item_id,
        "triggerid": trigger_id,
        "trigger_error": trigger_err,
    }


@app.post("/items/script", tags=["Items"], summary="Add Script Check Item", status_code=201)
def add_script_item(data: ScriptItemRequest, current_user: dict = Depends(require_operator)):
    """Adds an agent item that runs a bash or PowerShell script via system.run[].
    Requires EnableRemoteCommands=1 in the Zabbix agent config on the target host.
    """
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else None
    item_id, err = item_bot.add_script_item(
        hostname=data.hostname,
        script_type=data.script_type,
        script_mode=data.script_mode,
        script=data.script,
        file_arg=data.file_arg,
        item_name=data.item_name,
        value_type=data.value_type,
        team_name=team_name or data.team_name,
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add script item.")
    return {"message": "Script item added successfully.", "itemid": item_id}


@app.post("/items/db/odbc", tags=["Items"], summary="Add ODBC database monitor item", status_code=201)
def add_db_odbc_item(data: DbOdbcRequest, current_user: dict = Depends(require_operator)):
    """Adds a Zabbix ODBC database monitor item (type 4). Requires an ODBC DSN configured on the Zabbix server."""
    allowed = _team_hostname_filter(current_user)
    if allowed is not None and data.hostname not in allowed:
        raise HTTPException(status_code=403, detail="Host not in your team.")
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else ""
    item_id, err = item_bot.add_db_odbc_item(
        hostname=data.hostname,
        dsn=data.dsn,
        sql_query=data.sql_query,
        description=data.description,
        item_name=data.item_name,
        value_type=data.value_type,
        username=data.username,
        password=data.password,
        team_name=team_name,
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add ODBC item.")
    return {"message": "ODBC item added.", "itemid": item_id}


@app.post("/items/db/agent2", tags=["Items"], summary="Add Agent2 database plugin item", status_code=201)
def add_db_agent2_item(data: DbAgent2Request, current_user: dict = Depends(require_operator)):
    """Adds a Zabbix Agent2 database plugin item. Requires Zabbix Agent2 with the relevant DB plugin on the host."""
    allowed = _team_hostname_filter(current_user)
    if allowed is not None and data.hostname not in allowed:
        raise HTTPException(status_code=403, detail="Host not in your team.")
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else ""
    item_id, err = item_bot.add_db_agent2_item(
        hostname=data.hostname,
        engine=data.engine,
        conn_string=data.conn_string,
        metric=data.metric,
        item_name=data.item_name,
        extra_param=data.extra_param,
        value_type=data.value_type,
        team_name=team_name,
    )
    if not item_id:
        raise HTTPException(status_code=400, detail=err or "Failed to add Agent2 DB item.")
    return {"message": "Agent2 DB item added.", "itemid": item_id}


@app.post("/items/bulk", tags=["Items"], summary="Bulk Add Item to Multiple Hosts", status_code=201)
def bulk_add_items(data: BulkItemRequest, current_user: dict = Depends(require_operator)):
    """Adds the same item (agent, HTTP agent, or service check) to multiple hosts in one call."""
    if not data.hostnames:
        raise HTTPException(status_code=400, detail="hostnames list is empty.")
    team_id = _live_team_id(current_user)
    team_name = um.get_team_name(team_id) if team_id else ""
    config = data.model_dump(exclude={"hostnames"})
    config["team_name"] = team_name or config.get("team_name", "")
    results = item_bot.bulk_add_items(data.hostnames, config)
    ok = sum(1 for r in results if not r["error"])
    return {"message": f"{ok}/{len(results)} items added successfully.", "results": results}


@app.post("/triggers/bulk", tags=["Triggers"], summary="Bulk Add Trigger to Multiple Hosts", status_code=201)
def bulk_add_triggers(data: BulkTriggerRequest, current_user: dict = Depends(require_operator)):
    """Adds the same trigger to multiple hosts in one call."""
    if not data.hostnames:
        raise HTTPException(status_code=400, detail="hostnames list is empty.")
    config = data.model_dump(exclude={"hostnames"})
    results = item_bot.bulk_add_triggers(data.hostnames, config)
    ok = sum(1 for r in results if not r["error"])
    return {"message": f"{ok}/{len(results)} triggers added successfully.", "results": results}


# ── Dashboard routes ──────────────────────────────────────────────────


@app.get("/dashboard/graphs", tags=["Dashboard"], summary="List Zabbix graphs")
def list_graphs(
    hostid: str | None = None, current_user: dict = Depends(get_current_user)
):
    allowed = _team_hostname_filter(current_user)
    graphs = dashboard_bot.get_graphs(hostid)
    if allowed is not None:
        graphs = [
            g for g in graphs
            if any(h.get("host") in allowed for h in g.get("hosts", []))
        ]
    return {"graphs": graphs}


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
    allowed = _team_hostname_filter(current_user)
    hosts = dashboard_bot.get_hosts_metrics()
    if allowed is not None:
        hosts = [h for h in hosts if h.get("hostname") in allowed]
    return {"hosts": hosts}


@app.get(
    "/dashboard/items/recent", tags=["Dashboard"], summary="Recently created items"
)
def get_recent_items(limit: int = 30, current_user: dict = Depends(get_current_user)):
    allowed = _team_hostname_filter(current_user)
    items = dashboard_bot.get_recent_items(min(limit, 100))
    if allowed is not None:
        items = [i for i in items if i.get("hostname") in allowed]
    return {"items": items}


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
        team_id = _live_team_id(current_user)
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
        team_id = _live_team_id(current_user)
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
@_limiter.limit("10/minute")  # brute-force protection — 10 attempts per IP per minute
def login(request: Request, data: LoginRequest):
    user = um.get_user_by_username(data.username)
    if not user or not verify_password(data.password, user["password_hash"]):
        logger.warning("Failed login attempt for username %r from %s.", data.username, request.client.host if request.client else "unknown")
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    logger.info("User %r logged in (roles=%s) from %s.", data.username, user["roles"], request.client.host if request.client else "unknown")
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
        None if ("root" in roles or "auditor" in roles) else _live_team_id(current_user)
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
        and _live_team_id(current_user) != team_id
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
        and _live_team_id(current_user) != team_id
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
    team_id = _live_team_id(current_user)
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
    ) != _live_team_id(current_user):
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
    if "root" not in current_user.get("roles", []) and data.team_id != _live_team_id(
        current_user
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
    ) != _live_team_id(current_user):
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
    ) != _live_team_id(current_user):
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


class AlertRuleUpdate(BaseModel):
    operator: str
    threshold: float
    severity: int
    item_id: str | None = None
    item_name: str | None = None
    hostname: str | None = None


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


@app.put("/alerts/rules/{rule_id}", tags=["Alerts"], summary="Update alert rule")
def update_alert_rule(
    rule_id: int, data: AlertRuleUpdate, current_user: dict = Depends(get_current_user)
):
    if data.operator not in (">", "<", ">=", "<="):
        raise HTTPException(status_code=400, detail="operator must be >, <, >=, or <=")
    if not (0 <= data.severity <= 5):
        raise HTTPException(status_code=400, detail="severity must be 0–5")
    if not alert_bot.update_rule(
        rule_id, int(current_user["sub"]), data.operator, data.threshold, data.severity,
        data.item_id, data.item_name, data.hostname,
    ):
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"message": "Rule updated."}


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