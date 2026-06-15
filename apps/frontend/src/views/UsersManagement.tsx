"use client";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "../app/api";

const ConfirmDelete = ({ open, name, onConfirm, onClose }: { open: boolean; name: string; onConfirm: () => void; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>Delete?</DialogTitle>
    <DialogContent><Typography>Permanently delete <strong>{name}</strong>?</Typography></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm}>Delete</Button>
    </DialogActions>
  </Dialog>
);

// ── User Groups ───────────────────────────────────────────────────────

type UserGroup = { usrgrpid: string; name: string; gui_access_label: string; users_status_label: string; user_count: number };
type ZabbixUser = { userid: string; username: string; display: string };
type HGRight = { id: string; permission: number };
type TagFilter = { groupid: string; tag: string; value: string };

const makeEmptyUGForm = () => ({
  name: "", gui_access: 0, users_status: 0, debug_mode: 0,
  userids: [] as string[],
  hostgroup_rights: [] as HGRight[],
  templategroup_rights: [] as HGRight[],
  tag_filters: [] as TagFilter[],
});

const UserGroupsTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserGroup | null>(null);
  const [form, setForm] = useState(makeEmptyUGForm());
  const [dialogTab, setDialogTab] = useState(0);
  const [zabbixUsers, setZabbixUsers] = useState<ZabbixUser[]>([]);
  const [hostGroups, setHostGroups] = useState<Array<{ groupid: string; name: string }>>([]);
  const [templateGroups, setTemplateGroups] = useState<Array<{ groupid: string; name: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listUserGroups(); setItems(r.groups); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const openAdd = async () => {
    setForm(makeEmptyUGForm());
    setDialogTab(0);
    setAddOpen(true);
    try {
      const [zu, hg, tg] = await Promise.all([api.listZabbixUsers(), api.listHostGroups(), api.listTemplateGroups()]);
      setZabbixUsers(zu.users);
      setHostGroups(hg.groups);
      setTemplateGroups(tg.groups);
    } catch { /* non-critical */ }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createUserGroup({
        name: form.name,
        gui_access: form.gui_access,
        users_status: form.users_status,
        debug_mode: form.debug_mode,
        userids: form.userids.length ? form.userids : undefined,
        hostgroup_rights: form.hostgroup_rights.length ? form.hostgroup_rights : undefined,
        templategroup_rights: form.templategroup_rights.length ? form.templategroup_rights : undefined,
        tag_filters: form.tag_filters.length ? form.tag_filters : undefined,
      });
      showToast("User group created.", "success");
      setAddOpen(false);
      void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteUserGroup(deleteTarget.usrgrpid); showToast("User group deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  const addHGRight = (rights: HGRight[], setRights: (r: HGRight[]) => void, id: string) => {
    if (!id || rights.some((r) => r.id === id)) return;
    setRights([...rights, { id, permission: 2 }]);
  };
  const removeRight = (rights: HGRight[], setRights: (r: HGRight[]) => void, id: string) =>
    setRights(rights.filter((r) => r.id !== id));
  const updatePerm = (rights: HGRight[], setRights: (r: HGRight[]) => void, id: string, perm: number) =>
    setRights(rights.map((r) => r.id === id ? { ...r, permission: perm } : r));

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>User Groups</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={openAdd}>Add</Button>
        </Stack>
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 130 }}>GUI Access</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 110 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Members</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No user groups found.</Typography></TableCell></TableRow>
            ) : items.map((g) => (
              <TableRow key={g.usrgrpid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{g.name}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{g.gui_access_label}</Typography></TableCell>
                <TableCell><Chip label={g.users_status_label} size="small" color={g.users_status_label === "Enabled" ? "success" : "default"} variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} /></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{g.user_count}</Typography></TableCell>
                <TableCell><Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(g)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>Create user group</DialogTitle>
        <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} sx={{ px: 3, borderBottom: "1px solid", borderColor: "divider", minHeight: 36 }} TabIndicatorProps={{ style: { height: 2 } }}>
          <Tab label="User group" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Users" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Host permissions" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Template permissions" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Problem tag filter" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
        </Tabs>
        <DialogContent sx={{ minHeight: 320 }}>
          {/* Tab 0 — Basic */}
          {dialogTab === 0 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField size="small" label="Group name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <FormControl size="small" fullWidth>
                <InputLabel>Frontend access</InputLabel>
                <Select label="Frontend access" value={form.gui_access} onChange={(e) => setForm((f) => ({ ...f, gui_access: Number(e.target.value) }))}>
                  <MenuItem value={0}>System default</MenuItem>
                  <MenuItem value={1}>Internal</MenuItem>
                  <MenuItem value={2}>LDAP</MenuItem>
                  <MenuItem value={3}>Disabled</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={form.users_status === 0} onChange={(e) => setForm((f) => ({ ...f, users_status: e.target.checked ? 0 : 1 }))} size="small" />} label="Enabled" />
              <FormControlLabel control={<Switch checked={form.debug_mode === 1} onChange={(e) => setForm((f) => ({ ...f, debug_mode: e.target.checked ? 1 : 0 }))} size="small" />} label="Debug mode" />
            </Stack>
          )}

          {/* Tab 1 — Users */}
          {dialogTab === 1 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Select users to add to this group:</Typography>
              {zabbixUsers.length === 0 ? (
                <Typography variant="body2" color="text.disabled">No users found.</Typography>
              ) : (
                <Box sx={{ maxHeight: 320, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                  {zabbixUsers.map((u) => (
                    <FormControlLabel
                      key={u.userid}
                      control={
                        <Switch
                          size="small"
                          checked={form.userids.includes(u.userid)}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            userids: e.target.checked ? [...f.userids, u.userid] : f.userids.filter((id) => id !== u.userid),
                          }))}
                        />
                      }
                      label={<Typography variant="body2">{u.username}{u.display !== u.username ? ` (${u.display})` : ""}</Typography>}
                      sx={{ display: "flex", mx: 0, px: 1.5, py: 0.5, "&:hover": { bgcolor: "action.hover" } }}
                    />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Tab 2 — Host permissions */}
          {dialogTab === 2 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Set host group access permissions:</Typography>
              {form.hostgroup_rights.length > 0 && (
                <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1.5 }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Host group</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 150 }}>Permission</TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow></TableHead>
                    <TableBody>
                      {form.hostgroup_rights.map((r) => {
                        const grp = hostGroups.find((g) => g.groupid === r.id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell><Typography variant="body2">{grp?.name ?? r.id}</Typography></TableCell>
                            <TableCell>
                              <Select size="small" value={r.permission} onChange={(e) => updatePerm(form.hostgroup_rights, (v) => setForm((f) => ({ ...f, hostgroup_rights: v })), r.id, Number(e.target.value))} sx={{ fontSize: "0.8rem" }}>
                                <MenuItem value={0}>Denied</MenuItem>
                                <MenuItem value={2}>Read only</MenuItem>
                                <MenuItem value={3}>Read-write</MenuItem>
                              </Select>
                            </TableCell>
                            <TableCell><IconButton size="small" color="error" onClick={() => removeRight(form.hostgroup_rights, (v) => setForm((f) => ({ ...f, hostgroup_rights: v })), r.id)}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel>Add host group</InputLabel>
                <Select label="Add host group" value="" onChange={(e) => { addHGRight(form.hostgroup_rights, (v) => setForm((f) => ({ ...f, hostgroup_rights: v })), e.target.value as string); }}>
                  {hostGroups.filter((g) => !form.hostgroup_rights.some((r) => r.id === g.groupid)).map((g) => <MenuItem key={g.groupid} value={g.groupid}>{g.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Tab 3 — Template permissions */}
          {dialogTab === 3 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Set template group access permissions:</Typography>
              {form.templategroup_rights.length > 0 && (
                <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1.5 }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Template group</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 150 }}>Permission</TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow></TableHead>
                    <TableBody>
                      {form.templategroup_rights.map((r) => {
                        const grp = templateGroups.find((g) => g.groupid === r.id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell><Typography variant="body2">{grp?.name ?? r.id}</Typography></TableCell>
                            <TableCell>
                              <Select size="small" value={r.permission} onChange={(e) => updatePerm(form.templategroup_rights, (v) => setForm((f) => ({ ...f, templategroup_rights: v })), r.id, Number(e.target.value))} sx={{ fontSize: "0.8rem" }}>
                                <MenuItem value={0}>Denied</MenuItem>
                                <MenuItem value={2}>Read only</MenuItem>
                                <MenuItem value={3}>Read-write</MenuItem>
                              </Select>
                            </TableCell>
                            <TableCell><IconButton size="small" color="error" onClick={() => removeRight(form.templategroup_rights, (v) => setForm((f) => ({ ...f, templategroup_rights: v })), r.id)}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel>Add template group</InputLabel>
                <Select label="Add template group" value="" onChange={(e) => { addHGRight(form.templategroup_rights, (v) => setForm((f) => ({ ...f, templategroup_rights: v })), e.target.value as string); }}>
                  {templateGroups.filter((g) => !form.templategroup_rights.some((r) => r.id === g.groupid)).map((g) => <MenuItem key={g.groupid} value={g.groupid}>{g.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Tab 4 — Problem tag filter */}
          {dialogTab === 4 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Filter problems visible to this group by host group and tag:</Typography>
              {form.tag_filters.map((tf, idx) => (
                <Stack key={`tf-${idx}`} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Host group</InputLabel>
                    <Select label="Host group" value={tf.groupid} onChange={(e) => setForm((f) => ({ ...f, tag_filters: f.tag_filters.map((x, i) => i === idx ? { ...x, groupid: e.target.value as string } : x) }))}>
                      {hostGroups.map((g) => <MenuItem key={g.groupid} value={g.groupid}>{g.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField size="small" label="Tag" value={tf.tag} onChange={(e) => setForm((f) => ({ ...f, tag_filters: f.tag_filters.map((x, i) => i === idx ? { ...x, tag: e.target.value } : x) }))} sx={{ width: 140 }} />
                  <TextField size="small" label="Value" value={tf.value} onChange={(e) => setForm((f) => ({ ...f, tag_filters: f.tag_filters.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) }))} sx={{ width: 140 }} />
                  <IconButton size="small" color="error" onClick={() => setForm((f) => ({ ...f, tag_filters: f.tag_filters.filter((_, i) => i !== idx) }))}><DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton>
                </Stack>
              ))}
              <Button size="small" variant="outlined" startIcon={<AddOutlinedIcon />} onClick={() => setForm((f) => ({ ...f, tag_filters: [...f.tag_filters, { groupid: hostGroups[0]?.groupid ?? "", tag: "", value: "" }] }))}>Add filter</Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim()}>{saving ? <CircularProgress size={14} /> : "Create"}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Roles ─────────────────────────────────────────────────────────────

type Role = { roleid: string; name: string; type: number; type_label: string; readonly: number; rule_count: number };

const UI_SECTIONS = [
  {
    label: "Dashboards",
    items: [{ name: "monitoring.dashboard", label: "Dashboards" }],
  },
  {
    label: "Monitoring",
    items: [
      { name: "monitoring.problems", label: "Problems" },
      { name: "monitoring.hosts", label: "Hosts" },
      { name: "monitoring.latest_data", label: "Latest data" },
      { name: "monitoring.maps", label: "Maps" },
      { name: "monitoring.discovery", label: "Discovery" },
    ],
  },
  {
    label: "Services",
    items: [
      { name: "services.services", label: "Services" },
      { name: "services.sla", label: "SLA" },
      { name: "services.sla_report", label: "SLA report" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { name: "inventory.overview", label: "Overview" },
      { name: "inventory.hosts", label: "Hosts" },
    ],
  },
  {
    label: "Reports",
    items: [
      { name: "reports.system_info", label: "System information" },
      { name: "reports.scheduled_reports", label: "Scheduled reports" },
      { name: "reports.availability_report", label: "Availability report" },
      { name: "reports.top_triggers", label: "Top 100 triggers" },
      { name: "reports.notifications", label: "Notifications" },
      { name: "reports.audit_log", label: "Audit log" },
      { name: "reports.action_log", label: "Action log" },
    ],
  },
  {
    label: "Data collection",
    adminOnly: true,
    items: [
      { name: "data_collection.template_groups", label: "Template groups" },
      { name: "data_collection.host_groups", label: "Host groups" },
      { name: "data_collection.hosts", label: "Hosts" },
      { name: "data_collection.maintenance", label: "Maintenance" },
      { name: "data_collection.templates", label: "Templates" },
      { name: "data_collection.discovery", label: "Discovery" },
      { name: "data_collection.event_correlation", label: "Event correlation" },
    ],
  },
  {
    label: "Alerts",
    adminOnly: true,
    items: [
      { name: "alerts.trigger_actions", label: "Trigger actions" },
      { name: "alerts.service_actions", label: "Service actions" },
      { name: "alerts.discovery_actions", label: "Discovery actions" },
      { name: "alerts.autoregistration_actions", label: "Autoregistration actions" },
      { name: "alerts.internal_actions", label: "Internal actions" },
      { name: "alerts.media_types", label: "Media types" },
      { name: "alerts.scripts", label: "Scripts" },
    ],
  },
  {
    label: "Users",
    adminOnly: true,
    items: [
      { name: "users.user_groups", label: "User groups" },
      { name: "users.users", label: "Users" },
      { name: "users.user_roles", label: "User roles" },
      { name: "users.api_tokens", label: "API tokens" },
      { name: "users.authentication", label: "Authentication" },
    ],
  },
  {
    label: "Administration",
    adminOnly: true,
    items: [
      { name: "administration.general", label: "General" },
      { name: "administration.audit_log", label: "Audit log" },
      { name: "administration.housekeeping", label: "Housekeeping" },
      { name: "administration.proxy_groups", label: "Proxy groups" },
      { name: "administration.proxies", label: "Proxies" },
      { name: "administration.macros", label: "Macros" },
      { name: "administration.queue", label: "Queue" },
    ],
  },
];

const makeDefaultUiAccess = (): Record<string, boolean> => {
  const acc: Record<string, boolean> = {};
  for (const section of UI_SECTIONS) {
    for (const item of section.items) {
      acc[item.name] = true;
    }
  }
  return acc;
};

const makeDefaultRoleForm = () => ({
  name: "",
  type: 1,
  ui_access: makeDefaultUiAccess(),
  ui_default_access: 1,
  services_read_mode: 0,
  services_write_mode: 0,
  modules_default_access: 1,
  api_access: 1,
});

const RolesTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(makeDefaultRoleForm());
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listZabbixRoles(); setItems(r.roles); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onAdd = async () => {
    setSaving(true);
    try {
      await api.createRole({
        name: form.name,
        type: form.type,
        ui_access: form.ui_access,
        ui_default_access: form.ui_default_access,
        services_read_mode: form.services_read_mode,
        services_write_mode: form.services_write_mode,
        modules_default_access: form.modules_default_access,
        api_access: form.api_access,
      });
      showToast("Role created.", "success");
      setAddOpen(false);
      setForm(makeDefaultRoleForm());
      void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try { await api.updateRole(editTarget.roleid, { name: editName }); showToast("Role renamed.", "success"); setEditTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteRole(deleteTarget.roleid); showToast("Role deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  const toggleUi = (name: string, val: boolean) =>
    setForm((f) => ({ ...f, ui_access: { ...f.ui_access, [name]: val } }));
  const toggleSection = (items: Array<{ name: string }>, val: boolean) =>
    setForm((f) => {
      const updated = { ...f.ui_access };
      for (const item of items) updated[item.name] = val;
      return { ...f, ui_access: updated };
    });
  const sectionAllChecked = (items: Array<{ name: string }>) =>
    items.every((it) => form.ui_access[it.name]);

  const visibleSections = UI_SECTIONS.filter((s) => !s.adminOnly || form.type >= 2);

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Roles</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={() => { setForm(makeDefaultRoleForm()); setAddOpen(true); }}>Add</Button>
        </Stack>
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 130 }}>User type</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Rules</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Built-in</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No roles found.</Typography></TableCell></TableRow>
            ) : items.map((r) => (
              <TableRow key={r.roleid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography></TableCell>
                <TableCell><Chip label={r.type_label} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} /></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{r.rule_count}</Typography></TableCell>
                <TableCell>{r.readonly === 1 ? <Chip label="Built-in" size="small" sx={{ height: 18, fontSize: "0.62rem" }} /> : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Rename"><IconButton size="small" onClick={() => { setEditTarget(r); setEditName(r.name); }}><EditOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    {r.readonly !== 1 && <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(r)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create role dialog — full Zabbix-equivalent */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: "90vh" } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Create role</DialogTitle>
        <DialogContent dividers sx={{ overflowY: "auto" }}>
          <Stack spacing={2.5}>
            {/* Basic */}
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} sx={{ flex: 1 }} />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>User type</InputLabel>
                <Select label="User type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: Number(e.target.value) }))}>
                  <MenuItem value={1}>User</MenuItem>
                  <MenuItem value={2}>Admin</MenuItem>
                  <MenuItem value={3}>Super admin</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Divider />

            {/* UI element access */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Access to UI elements</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              {visibleSections.map((section) => (
                <Card key={section.label} variant="outlined" sx={{ p: 1.5 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={sectionAllChecked(section.items)}
                        onChange={(e) => toggleSection(section.items, e.target.checked)}
                      />
                    }
                    label={<Typography variant="body2" sx={{ fontWeight: 700 }}>{section.label}</Typography>}
                    sx={{ mb: 0.5 }}
                  />
                  <Box sx={{ pl: 1 }}>
                    {section.items.map((item) => (
                      <FormControlLabel
                        key={item.name}
                        control={
                          <Switch
                            size="small"
                            checked={!!form.ui_access[item.name]}
                            onChange={(e) => toggleUi(item.name, e.target.checked)}
                          />
                        }
                        label={<Typography variant="caption">{item.label}</Typography>}
                        sx={{ display: "flex", my: 0 }}
                      />
                    ))}
                  </Box>
                </Card>
              ))}
            </Box>

            <FormControlLabel
              control={<Switch size="small" checked={form.ui_default_access === 1} onChange={(e) => setForm((f) => ({ ...f, ui_default_access: e.target.checked ? 1 : 0 }))} />}
              label={<Typography variant="body2">Default access to new UI elements</Typography>}
            />

            <Divider />

            {/* Services access */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Access to services</Typography>
            <Stack direction="row" spacing={2}>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Read access</InputLabel>
                <Select label="Read access" value={form.services_read_mode} onChange={(e) => setForm((f) => ({ ...f, services_read_mode: Number(e.target.value) }))}>
                  <MenuItem value={0}>All</MenuItem>
                  <MenuItem value={1}>None</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Write access</InputLabel>
                <Select label="Write access" value={form.services_write_mode} onChange={(e) => setForm((f) => ({ ...f, services_write_mode: Number(e.target.value) }))}>
                  <MenuItem value={0}>All</MenuItem>
                  <MenuItem value={1}>None</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Divider />

            {/* Modules & API */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Access to modules</Typography>
            <FormControlLabel
              control={<Switch size="small" checked={form.modules_default_access === 1} onChange={(e) => setForm((f) => ({ ...f, modules_default_access: e.target.checked ? 1 : 0 }))} />}
              label={<Typography variant="body2">Default access to new modules</Typography>}
            />

            <Divider />

            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>API access</Typography>
            <FormControlLabel
              control={<Switch size="small" checked={form.api_access === 1} onChange={(e) => setForm((f) => ({ ...f, api_access: e.target.checked ? 1 : 0 }))} />}
              label={<Typography variant="body2">Enabled</Typography>}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onAdd} disabled={saving || !form.name.trim()}>{saving ? <CircularProgress size={14} /> : "Create"}</Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Rename role</DialogTitle>
        <DialogContent>
          <TextField size="small" label="Name *" value={editName} onChange={(e) => setEditName(e.target.value)} fullWidth sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={onEdit} disabled={saving || !editName.trim()}>{saving ? <CircularProgress size={14} /> : "Save"}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── API Tokens ────────────────────────────────────────────────────────

type ApiToken = { tokenid: string; name: string; userid: string; username: string; status: number; expires_at: number; created_at: number; lastaccess: number };

const fmtTs = (ts: number) => ts ? new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "—";

const ApiTokensTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<ApiToken[]>([]);
  const [users, setUsers] = useState<Array<{ id: number; username: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiToken | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", userid: "", expires_at: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, ur] = await Promise.all([api.listApiTokens(), api.listUsers()]);
      setItems(tr.tokens); setUsers(ur.users);
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      const payload: { name: string; userid: string; expires_at?: number } = { name: form.name, userid: form.userid };
      if (form.expires_at) payload.expires_at = Math.floor(new Date(form.expires_at).getTime() / 1000);
      const r = await api.createApiToken(payload);
      if (r.token) setNewToken(r.token);
      showToast("API token created.", "success"); setAddOpen(false);
      setForm({ name: "", userid: "", expires_at: "" }); void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteApiToken(deleteTarget.tokenid); showToast("Token deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>API Tokens</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={() => setAddOpen(true)}>Add</Button>
        </Stack>
      </Box>

      {newToken && (
        <Alert severity="success" onClose={() => setNewToken(null)} sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Token created — copy it now, it won&apos;t be shown again:</Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all", bgcolor: "rgba(0,0,0,0.12)", p: 0.75, borderRadius: 1 }}>{newToken}</Typography>
        </Alert>
      )}

      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }}>User</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 140 }}>Expires</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 140 }}>Created</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 140 }}>Last access</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No API tokens found.</Typography></TableCell></TableRow>
            ) : items.map((t) => {
              const expired = t.expires_at > 0 && t.expires_at < now;
              return (
                <TableRow key={t.tokenid} hover sx={expired ? { opacity: 0.6 } : {}}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{t.name}{expired && <Chip label="Expired" size="small" color="error" sx={{ height: 16, fontSize: "0.55rem", ml: 0.75 }} />}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{t.username || t.userid}</Typography></TableCell>
                  <TableCell><Chip label={t.status === 0 ? "Enabled" : "Disabled"} size="small" color={t.status === 0 ? "success" : "default"} variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} /></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{t.expires_at ? fmtTs(t.expires_at) : "Never"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{fmtTs(t.created_at)}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{fmtTs(t.lastaccess)}</Typography></TableCell>
                  <TableCell><Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(t)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create API token</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Token name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>User *</InputLabel>
              <Select label="User *" value={form.userid} onChange={(e) => setForm((f) => ({ ...f, userid: e.target.value as string }))}>
                {users.map((u) => <MenuItem key={u.id} value={String(u.id)}>{u.username}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Expires (optional)" type="datetime-local" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} InputLabelProps={{ shrink: true }} helperText="Leave blank for no expiry" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim() || !form.userid}>{saving ? <CircularProgress size={14} /> : "Create"}</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Authentication ────────────────────────────────────────────────────

const AUTH_TYPE_LABELS: Record<string, string> = { "0": "Internal", "1": "LDAP", "2": "SAML" };

const PASSWD_RULES: Array<{ bit: number; label: string }> = [
  { bit: 1, label: "Avoid easy-to-guess passwords" },
  { bit: 2, label: "Must contain uppercase letters" },
  { bit: 4, label: "Must contain lowercase letters" },
  { bit: 8, label: "Must contain digits" },
  { bit: 16, label: "Must contain special characters" },
];

const AuthenticationTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.getAuthSettings();
      setSettings(s);
      setForm(s);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const set = (key: string, val: string | number) => setForm((f) => ({ ...f, [key]: val }));

  const onSave = async () => {
    setSaving(true);
    try {
      await api.updateAuthSettings(form);
      showToast("Authentication settings updated.", "success");
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const authType = String(form.authentication_type ?? settings.authentication_type ?? "0");
  const passwdRules = Number(form.passwd_check_rules ?? settings.passwd_check_rules ?? 0);

  const toggleRule = (bit: number) => {
    const cur = Number(form.passwd_check_rules ?? settings.passwd_check_rules ?? 0);
    set("passwd_check_rules", cur ^ bit);
  };

  if (loading) return <LinearProgress sx={{ mt: 2 }} />;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Authentication Settings</Typography>
        <Button variant="contained" size="small" onClick={onSave} disabled={saving}>
          {saving ? <CircularProgress size={14} /> : "Save"}
        </Button>
      </Box>

      {/* Auth method */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Authentication method</Typography>
        <Divider sx={{ my: 1 }} />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Default auth method</InputLabel>
          <Select label="Default auth method" value={authType} onChange={(e) => set("authentication_type", e.target.value)}>
            {Object.entries(AUTH_TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* LDAP settings */}
      {authType === "1" && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>LDAP Configuration</Typography>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField size="small" label="LDAP host" value={String(form.ldap_host ?? "")} onChange={(e) => set("ldap_host", e.target.value)} fullWidth placeholder="ldap.example.com" />
              <TextField size="small" label="Port" type="number" value={String(form.ldap_port ?? "389")} onChange={(e) => set("ldap_port", e.target.value)} sx={{ maxWidth: 100 }} />
            </Stack>
            <TextField size="small" label="Base DN" value={String(form.ldap_base_dn ?? "")} onChange={(e) => set("ldap_base_dn", e.target.value)} fullWidth placeholder="dc=example,dc=com" />
            <TextField size="small" label="Bind DN" value={String(form.ldap_bind_dn ?? "")} onChange={(e) => set("ldap_bind_dn", e.target.value)} fullWidth placeholder="cn=admin,dc=example,dc=com" />
            <TextField size="small" label="Bind password" type="password" value={String(form.ldap_bind_password ?? "")} onChange={(e) => set("ldap_bind_password", e.target.value)} fullWidth />
            <TextField size="small" label="Search attribute" value={String(form.ldap_search_attribute ?? "")} onChange={(e) => set("ldap_search_attribute", e.target.value)} fullWidth placeholder="uid" />
            <FormControlLabel
              control={<Switch size="small" checked={String(form.ldap_case_sensitive ?? "1") === "1"} onChange={(_, v) => set("ldap_case_sensitive", v ? "1" : "0")} />}
              label={<Typography variant="body2">Case-sensitive login</Typography>}
            />
          </Stack>
        </Box>
      )}

      {/* SAML settings */}
      {authType === "2" && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>SAML Configuration</Typography>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={1.5}>
            <TextField size="small" label="IdP entity ID" value={String(form.saml_idp_entityid ?? "")} onChange={(e) => set("saml_idp_entityid", e.target.value)} fullWidth />
            <TextField size="small" label="SSO service URL" value={String(form.saml_sso_url ?? "")} onChange={(e) => set("saml_sso_url", e.target.value)} fullWidth />
            <TextField size="small" label="SLO service URL" value={String(form.saml_slo_url ?? "")} onChange={(e) => set("saml_slo_url", e.target.value)} fullWidth />
            <TextField size="small" label="SP entity ID" value={String(form.saml_sp_entityid ?? "")} onChange={(e) => set("saml_sp_entityid", e.target.value)} fullWidth />
            <TextField size="small" label="Username attribute" value={String(form.saml_username_attribute ?? "")} onChange={(e) => set("saml_username_attribute", e.target.value)} fullWidth placeholder="uid" />
            <Stack direction="row" flexWrap="wrap" gap={1.5}>
              {[
                { key: "saml_sign_messages", label: "Sign messages" },
                { key: "saml_sign_assertions", label: "Sign assertions" },
                { key: "saml_sign_authn_requests", label: "Sign AuthnRequests" },
                { key: "saml_encrypt_nameid", label: "Encrypt NameID" },
                { key: "saml_encrypt_assertions", label: "Encrypt assertions" },
                { key: "saml_case_sensitive", label: "Case-sensitive" },
              ].map(({ key, label }) => (
                <FormControlLabel key={key}
                  control={<Switch size="small" checked={String(form[key] ?? "0") === "1"} onChange={(_, v) => set(key, v ? "1" : "0")} />}
                  label={<Typography variant="body2">{label}</Typography>}
                />
              ))}
            </Stack>
          </Stack>
        </Box>
      )}

      {/* Password policy */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Password Policy</Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={1.5}>
          <TextField
            size="small"
            label="Minimum password length"
            type="number"
            value={String(form.passwd_min_length ?? settings.passwd_min_length ?? "8")}
            onChange={(e) => set("passwd_min_length", e.target.value)}
            sx={{ maxWidth: 220 }}
            inputProps={{ min: 1, max: 70 }}
          />
          <Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Password complexity rules</Typography>
            <Stack spacing={0.5}>
              {PASSWD_RULES.map(({ bit, label }) => (
                <FormControlLabel key={bit}
                  control={<Switch size="small" checked={(passwdRules & bit) !== 0} onChange={() => toggleRule(bit)} />}
                  label={<Typography variant="body2">{label}</Typography>}
                />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Box>

      {/* HTTP auth */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>HTTP Authentication</Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={1.5}>
          <FormControlLabel
            control={<Switch size="small" checked={String(form.http_auth_enabled ?? settings.http_auth_enabled ?? "0") === "1"} onChange={(_, v) => set("http_auth_enabled", v ? "1" : "0")} />}
            label={<Typography variant="body2">Enable HTTP authentication</Typography>}
          />
          {String(form.http_auth_enabled ?? settings.http_auth_enabled ?? "0") === "1" && (
            <TextField size="small" label="Strip domains (comma-separated)" value={String(form.http_strip_domains ?? "")} onChange={(e) => set("http_strip_domains", e.target.value)} fullWidth placeholder="DOMAIN,DOMAIN2" />
          )}
        </Stack>
      </Box>

      <Box sx={{ pt: 1 }}>
        <Button variant="contained" size="small" onClick={onSave} disabled={saving}>
          {saving ? <CircularProgress size={14} /> : "Save changes"}
        </Button>
      </Box>
    </Stack>
  );
};

// ── Main ──────────────────────────────────────────────────────────────

const TAB_SLUGS = ["user-groups", "roles", "api-tokens", "authentication"];

const UsersManagementInner = () => {
  const searchParams = useSearchParams();
  const tab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get("tab") ?? ""));
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <PeopleOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Users</Typography>
          <Typography variant="body2" color="text.secondary">User groups, roles, API tokens, and authentication settings. Individual users and teams are managed in the Users/Teams pages.</Typography>
        </Box>
      </Box>
      <Card>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <UserGroupsTab showToast={showToast} />}
          {tab === 1 && <RolesTab showToast={showToast} />}
          {tab === 2 && <ApiTokensTab showToast={showToast} />}
          {tab === 3 && <AuthenticationTab showToast={showToast} />}
        </Box>
      </Card>
      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>{toast.message}</Alert>
      </Snackbar>
    </Stack>
  );
};

export const UsersManagement = () => (
  <Suspense fallback={null}>
    <UsersManagementInner />
  </Suspense>
);
