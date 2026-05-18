from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from io import BytesIO
import pandas as pd

from Host_Manager import Host_Manager
from Item_Manager import Item_Manager
from Database import init_db
from Auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_admin, require_operator, require_root,
    can_grant_roles,
)
import User_Management as um

# ── App & Managers ────────────────────────────────────────────────────
app = FastAPI(
    title="Zabbix DevOps API",
    description="Manage Zabbix hosts and items via REST",
    version="1.0.0",
)
host_bot = Host_Manager()
item_bot = Item_Manager()
init_db()
um.seed_root()

# Retroactively tag any hosts that were assigned before tagging was introduced
def _sync_tags():
    try:
        for team in um.get_overview():
            team_name = team["name"]
            for hostname in team["hosts"]:
                host_bot.tag_host(hostname, team_name)
    except Exception as exc:
        print(f"Tag sync failed (non-fatal): {repr(exc)}")

_sync_tags()

# ── Request Schemas ───────────────────────────────────────────────────

class HostRequest(BaseModel):
    hostname: str
    ip: str
    template: Optional[str] = "Linux by Zabbix agent"

class ItemRequest(BaseModel):
    hostname: str
    item_name: str
    item_key: str
    value_type: Optional[int] = 3   # 3 = integer (most common)

class TriggerRequest(BaseModel):
    hostname: str
    item_key: str
    trigger_name: str
    threshold: float
    operator: Optional[str] = ">"
    severity: Optional[int] = 3

# ── Routes ────────────────────────────────────────────────────────────

@app.get("/health", tags=["Status"], summary="API Health Check")
def health():
    """Returns whether the API is up and connected to Zabbix."""
    return {"status": "online", "zabbix_connected": host_bot.zapi is not None}


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
        raise HTTPException(status_code=400, detail="Failed to create host. Check logs.")
    team_id = current_user.get("team_id")
    if team_id:
        team_name = um.get_team_name(team_id)
        um.assign_host(team_id, data.hostname)
        if team_name:
            host_bot.tag_host(data.hostname, team_name)
    return {"message": "Host created successfully.", "hostid": result}


@app.post("/hosts/bulk", tags=["Hosts"], summary="Bulk Create Hosts from CSV/XLSX", status_code=201)
async def bulk_create_hosts(file: UploadFile = File(...)):
    """Creates multiple hosts from a CSV/XLSX file with columns: hostname, ip, template(optional)."""
    filename = (file.filename or "").lower()
    if not filename.endswith((".csv", ".xlsx")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .csv or .xlsx")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

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

        hostid = host_bot.create_server(hostname, ip, template_name=template or default_template)
        if hostid:
            created.append({"row": int(idx) + 2, "hostname": hostname, "hostid": hostid})
        else:
            failed.append({"row": int(idx) + 2, "hostname": hostname, "reason": "Zabbix create failed"})

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
            raise HTTPException(status_code=403, detail="You can only delete hosts assigned to your own team.")
    um.unassign_host(hostname)
    success = host_bot.delete_server(hostname)
    if not success:
        raise HTTPException(status_code=404, detail=f"Host '{hostname}' not found or deletion failed.")
    return {"message": f"Host '{hostname}' deleted successfully."}


@app.get("/items/{hostname}", tags=["Items"], summary="List items for a host")
def list_items(hostname: str, current_user: dict = Depends(get_current_user)):
    return {"items": item_bot.list_items(hostname)}

@app.delete("/items/{itemid}", tags=["Items"], summary="Delete item by ID")
def delete_item(itemid: str, current_user: dict = Depends(require_operator)):
    if not item_bot.delete_item(itemid):
        raise HTTPException(status_code=404, detail="Item not found or could not be deleted.")
    return {"message": "Item deleted."}

@app.get("/triggers/{hostname}", tags=["Triggers"], summary="List triggers for a host")
def list_triggers(hostname: str, current_user: dict = Depends(get_current_user)):
    return {"triggers": item_bot.list_triggers(hostname)}

@app.delete("/triggers/{triggerid}", tags=["Triggers"], summary="Delete trigger by ID")
def delete_trigger(triggerid: str, current_user: dict = Depends(require_operator)):
    if not item_bot.delete_trigger(triggerid):
        raise HTTPException(status_code=404, detail="Trigger not found or could not be deleted.")
    return {"message": "Trigger deleted."}

@app.post("/items", tags=["Items"], summary="Add Monitoring Item", status_code=201)
def add_item(data: ItemRequest, current_user: dict = Depends(require_operator)):
    """Adds a monitoring item (metric) to an existing host."""
    result = item_bot.add_item(data.hostname, data.item_name, data.item_key, data.value_type)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to add item. Check host name and key.")
    return {"message": "Item added successfully.", "itemid": result}


@app.post("/triggers", tags=["Triggers"], summary="Add Trigger to Item", status_code=201)
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


# ── Auth / Teams / Users schemas ──────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class TeamRequest(BaseModel):
    name: str
    description: Optional[str] = ""

class UserRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = ""
    roles: Optional[list[str]] = ["member"]
    team_id: Optional[int] = None

class HostAssignRequest(BaseModel):
    hostname: str

class PasswordChangeRequest(BaseModel):
    new_password: str

class UserUpdateRequest(BaseModel):
    roles: list[str]
    team_id: Optional[int] = None

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
        "user": {"id": user["id"], "username": user["username"], "roles": user["roles"], "team_id": user["team_id"]},
    }

@app.get("/auth/me", tags=["Auth"], summary="Current user")
def me(current_user: dict = Depends(get_current_user)):
    return current_user

# ── Teams routes ──────────────────────────────────────────────────────

@app.get("/teams/overview", tags=["Teams"], summary="Teams with members and hosts")
def teams_overview(current_user: dict = Depends(get_current_user)):
    # root and auditor see all teams; everyone else sees only their own
    roles = current_user.get("roles", [])
    team_filter = None if ("root" in roles or "auditor" in roles) else current_user.get("team_id")
    return {"teams": um.get_overview(team_id=team_filter)}

@app.get("/teams", tags=["Teams"], summary="List teams")
def list_teams(current_user: dict = Depends(get_current_user)):
    return {"teams": um.list_teams()}

@app.post("/teams", tags=["Teams"], summary="Create team", status_code=201)
def create_team(data: TeamRequest, current_user: dict = Depends(require_root)):
    result = um.create_team(data.name, data.description or "")
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create team. Name may already exist.")
    return result

@app.delete("/teams/{team_id}", tags=["Teams"], summary="Delete team")
def delete_team(team_id: int, current_user: dict = Depends(require_root)):
    if not um.delete_team(team_id):
        raise HTTPException(status_code=404, detail="Team not found.")
    return {"message": "Team deleted."}

@app.post("/teams/{team_id}/hosts", tags=["Teams"], summary="Assign host to team", status_code=201)
def assign_host(team_id: int, data: HostAssignRequest, current_user: dict = Depends(require_admin)):
    if "root" not in current_user.get("roles", []) and current_user.get("team_id") != team_id:
        raise HTTPException(status_code=403, detail="You can only assign hosts to your own team.")
    if not um.assign_host(team_id, data.hostname):
        raise HTTPException(status_code=400, detail="Failed to assign host.")
    team_name = um.get_team_name(team_id)
    if team_name:
        host_bot.tag_host(data.hostname, team_name)
    return {"message": "Host assigned."}

@app.delete("/teams/{team_id}/hosts/{hostname}", tags=["Teams"], summary="Remove host from team")
def unassign_host(team_id: int, hostname: str, current_user: dict = Depends(require_admin)):
    if "root" not in current_user.get("roles", []) and current_user.get("team_id") != team_id:
        raise HTTPException(status_code=403, detail="You can only remove hosts from your own team.")
    if not um.unassign_host(hostname):
        raise HTTPException(status_code=404, detail="Host assignment not found.")
    host_bot.untag_host(hostname)
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
def update_user(user_id: int, data: UserUpdateRequest, current_user: dict = Depends(require_admin)):
    target = um.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if "root" not in current_user.get("roles", []) and target.get("team_id") != current_user.get("team_id"):
        raise HTTPException(status_code=403, detail="You can only edit users in your own team.")
    if not can_grant_roles(current_user.get("roles", []), data.roles):
        raise HTTPException(status_code=403, detail="You cannot assign roles higher than your own.")
    if not um.update_user_profile(user_id, data.roles, data.team_id):
        raise HTTPException(status_code=400, detail="Failed to update user.")
    return {"message": "User updated."}


@app.post("/users", tags=["Teams"], summary="Create user", status_code=201)
def create_user(data: UserRequest, current_user: dict = Depends(require_admin)):
    if "root" not in current_user.get("roles", []) and data.team_id != current_user.get("team_id"):
        raise HTTPException(status_code=403, detail="You can only create users in your own team.")
    if not can_grant_roles(current_user.get("roles", []), data.roles or ["member"]):
        raise HTTPException(status_code=403, detail="You cannot assign roles higher than your own.")
    result = um.create_user(
        data.username,
        hash_password(data.password),
        data.email or "",
        data.roles or ["member"],
        data.team_id,
    )
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create user. Username may already exist.")
    return result

@app.put("/users/{user_id}/password", tags=["Teams"], summary="Change user password")
def change_password(user_id: int, data: PasswordChangeRequest, current_user: dict = Depends(require_admin)):
    target = um.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if "root" not in current_user.get("roles", []) and target.get("team_id") != current_user.get("team_id"):
        raise HTTPException(status_code=403, detail="You can only change passwords for users in your own team.")
    if not um.update_password(user_id, hash_password(data.new_password)):
        raise HTTPException(status_code=400, detail="Failed to update password.")
    return {"message": "Password updated."}

@app.delete("/users/{user_id}", tags=["Teams"], summary="Delete user")
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    if "root" not in current_user.get("roles", []):
        target = um.get_user_by_id(user_id)
        if not target or target.get("team_id") != current_user.get("team_id"):
            raise HTTPException(status_code=403, detail="You can only delete users in your own team.")
    if not um.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "User deleted."}

# ── Runner ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=6769)