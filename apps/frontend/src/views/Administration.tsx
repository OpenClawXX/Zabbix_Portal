"use client";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
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
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
    <DialogContent><Typography>Delete <strong>{name}</strong>?</Typography></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm}>Delete</Button>
    </DialogActions>
  </Dialog>
);

const fmtTs = (ts: number) => ts ? new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "—";

// ── Proxies ───────────────────────────────────────────────────────────

type Proxy = { proxyid: string; name: string; mode: number; mode_label: string; description: string; lastaccess: number; version: string; host_count: number };

const ProxiesTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Proxy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proxy | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", operating_mode: 0, description: "" });
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listProxies(); setItems(r.proxies); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onAdd = async () => {
    setSaving(true);
    try { await api.createProxy(form); showToast("Proxy created.", "success"); setAddOpen(false); setForm({ name: "", operating_mode: 0, description: "" }); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try { await api.updateProxy(editTarget.proxyid, editForm); showToast("Proxy updated.", "success"); setEditTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteProxy(deleteTarget.proxyid); showToast("Proxy deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Proxies</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={() => setAddOpen(true)}>Add</Button>
        </Stack>
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Mode</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Version</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 70 }}>Hosts</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 150 }}>Last seen</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No proxies configured.</Typography></TableCell></TableRow>
            ) : items.map((p) => (
              <TableRow key={p.proxyid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography></TableCell>
                <TableCell><Chip label={p.mode_label} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} /></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{p.version || "—"}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{p.host_count}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>{fmtTs(p.lastaccess)}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{p.description || "—"}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditTarget(p); setEditForm({ name: p.name, description: p.description }); }}><EditOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add proxy</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Mode</InputLabel>
              <Select label="Mode" value={form.operating_mode} onChange={(e) => setForm((f) => ({ ...f, operating_mode: Number(e.target.value) }))}>
                <MenuItem value={0}>Active</MenuItem>
                <MenuItem value={1}>Passive</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onAdd} disabled={saving || !form.name.trim()}>{saving ? <CircularProgress size={14} /> : "Create"}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit proxy</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField size="small" label="Description" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={onEdit} disabled={saving || !editForm.name.trim()}>{saving ? <CircularProgress size={14} /> : "Save"}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Proxy Groups (Zabbix 7.x) ─────────────────────────────────────────

type ProxyGroup = { proxygroupid: string; name: string; failover_delay: string; min_online: number; description: string; proxy_count: number };

const ProxyGroupsTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<ProxyGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProxyGroup | null>(null);
  const [form, setForm] = useState({ name: "", failover_delay: "1m", min_online: 1, description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listProxyGroups(); setItems(r.proxy_groups); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onAdd = async () => {
    setSaving(true);
    try {
      await api.createProxyGroup(form);
      showToast("Proxy group created.", "success");
      setAddOpen(false);
      setForm({ name: "", failover_delay: "1m", min_online: 1, description: "" });
      void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
    finally { setSaving(false); }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteProxyGroup(deleteTarget.proxygroupid); showToast("Proxy group deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Proxy Groups</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={() => setAddOpen(true)}>Add</Button>
        </Stack>
      </Box>
      {items.length === 0 && !loading && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Proxy groups require Zabbix 7.0 or later. No proxy groups found.
        </Alert>
      )}
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }}>Failover period</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Min proxies</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 70 }}>Proxies</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((g) => (
              <TableRow key={g.proxygroupid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{g.name}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{g.failover_delay}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{g.min_online}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{g.proxy_count}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{g.description || "—"}</Typography></TableCell>
                <TableCell>
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(g)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>New proxy group</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField
              size="small" label="Failover period *" value={form.failover_delay}
              onChange={(e) => setForm((f) => ({ ...f, failover_delay: e.target.value }))}
              helperText="e.g. 1m, 30s, 5m"
            />
            <TextField
              size="small" label="Minimum number of proxies *" type="number"
              value={form.min_online}
              onChange={(e) => setForm((f) => ({ ...f, min_online: Math.max(1, Number(e.target.value)) }))}
              inputProps={{ min: 1 }}
            />
            <TextField
              size="small" label="Description" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              multiline rows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onAdd} disabled={saving || !form.name.trim() || !form.failover_delay.trim()}>
            {saving ? <CircularProgress size={14} /> : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Macros ────────────────────────────────────────────────────────────

type Macro = { globalmacroid: string; macro: string; value: string; type_label: string; description: string };

const MacrosTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Macro | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Macro | null>(null);
  const [form, setForm] = useState({ macro: "", value: "", description: "", type: 0 });
  const [editForm, setEditForm] = useState({ value: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listMacros(); setItems(r.macros); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateMacro(editTarget.globalmacroid, editForm);
        showToast("Macro updated.", "success"); setEditTarget(null);
      } else {
        await api.createMacro(form);
        showToast("Macro created.", "success"); setAddOpen(false); setForm({ macro: "", value: "", description: "", type: 0 });
      }
      void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteMacro(deleteTarget.globalmacroid); showToast("Macro deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Global Macros</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={() => setAddOpen(true)}>Add</Button>
        </Stack>
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 480, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 220 }}>Macro</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Value</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No global macros found.</Typography></TableCell></TableRow>
            ) : items.map((m) => (
              <TableRow key={m.globalmacroid} hover>
                <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 600 }}>{m.macro}</Typography></TableCell>
                <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }} noWrap>{m.value}</Typography></TableCell>
                <TableCell><Chip label={m.type_label} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.6rem" }} /></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{m.description || "—"}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditTarget(m); setEditForm({ value: m.value, description: m.description }); }}><EditOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(m)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add global macro</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Macro *" value={form.macro} onChange={(e) => setForm((f) => ({ ...f, macro: e.target.value }))} placeholder="{$MACRO_NAME}" helperText="Will be wrapped in {$ } if not already" />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: Number(e.target.value) }))}>
                <MenuItem value={0}>Text</MenuItem>
                <MenuItem value={1}>Secret text</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Value" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} type={form.type === 1 ? "password" : "text"} />
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.macro.trim()}>{saving ? <CircularProgress size={14} /> : "Create"}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit {editTarget?.macro}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Value" value={editForm.value} onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))} />
            <TextField size="small" label="Description" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving}>{saving ? <CircularProgress size={14} /> : "Save"}</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.macro ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Queue ─────────────────────────────────────────────────────────────

const QueueTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [data, setData] = useState<{ items: Array<Record<string, string>>; total: number; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.getQueue()); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const fmtNext = (ts: string | number) => {
    const t = typeof ts === "string" ? parseInt(ts, 10) : ts;
    if (!t || t <= 0) return "—";
    const diff = t - Math.floor(Date.now() / 1000);
    if (diff < 0) return <Typography component="span" variant="caption" color="error.main">overdue {Math.abs(diff)}s</Typography>;
    if (diff < 60) return `in ${diff}s`;
    return `in ${Math.floor(diff / 60)}m ${diff % 60}s`;
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Queue Overview</Typography>
        {loading ? <CircularProgress size={14} /> : data && !data.error && <Chip label={`${data.total} items`} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
      </Box>
      {data?.error && (
        <Alert severity="info">{data.error}</Alert>
      )}
      {data && !data.error && data.items.length === 0 && <Alert severity="success">Queue is empty — all items are up to date.</Alert>}
      {data && !data.error && data.items.length > 0 && (
        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 480, overflow: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Host</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Delay</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Next check</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Item ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: queue rows have no stable id
                <TableRow key={i} hover>
                  <TableCell><Typography variant="body2">{(row as Record<string, string>).hostname || "—"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{(row as Record<string, string>).item_name || "—"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{(row as Record<string, string>).delay || "—"}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{fmtNext((row as Record<string, string>).nextcheck)}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.disabled">{(row as Record<string, string>).itemid}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
};

// ── Housekeeping ──────────────────────────────────────────────────────

const HK_FIELDS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "hk_events_mode", label: "Enable internal housekeeping for events" },
  { key: "hk_events_trigger", label: "Trigger events storage period", unit: "days" },
  { key: "hk_events_discovery", label: "Discovery events storage period", unit: "days" },
  { key: "hk_events_autoreg", label: "Autoregistration events", unit: "days" },
  { key: "hk_events_internal", label: "Internal events", unit: "days" },
  { key: "hk_services_mode", label: "Enable internal housekeeping for services" },
  { key: "hk_services", label: "Service data storage period", unit: "days" },
  { key: "hk_audit_mode", label: "Enable internal housekeeping for audit" },
  { key: "hk_audit", label: "Audit log storage period", unit: "days" },
  { key: "hk_sessions_mode", label: "Enable internal housekeeping for user sessions" },
  { key: "hk_sessions", label: "User sessions storage period", unit: "days" },
  { key: "hk_history_mode", label: "Enable internal housekeeping for history" },
  { key: "hk_history_global", label: "Override item history period" },
  { key: "hk_history", label: "Data storage period (history)", unit: "days" },
  { key: "hk_trends_mode", label: "Enable internal housekeeping for trends" },
  { key: "hk_trends_global", label: "Override item trend period" },
  { key: "hk_trends", label: "Data storage period (trends)", unit: "days" },
];

const HousekeepingTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const s = await api.getAdminSettings(); setSettings(s); setEdited({}); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const current = (key: string) => edited[key] ?? settings[key] ?? "";
  const onSave = async () => {
    if (!Object.keys(edited).length) return;
    setSaving(true);
    try { await api.updateHousekeeping(edited); showToast("Settings saved.", "success"); setEdited({}); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };

  const isToggle = (key: string) => key.endsWith("_mode") || key.startsWith("hk_history_global") || key.startsWith("hk_trends_global");

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Housekeeping</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" onClick={onSave} disabled={saving || !Object.keys(edited).length}>
            {saving ? <CircularProgress size={14} /> : "Save changes"}
          </Button>
        </Stack>
      </Box>
      {Object.keys(settings).length === 0 && !loading && (
        <Alert severity="warning">Could not load Zabbix settings. Check that the backend Zabbix user has admin rights.</Alert>
      )}
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          {HK_FIELDS.map((f) => {
            const val = current(f.key);
            return (
              <Box key={f.key} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="body2" sx={{ flex: 1 }}>{f.label}</Typography>
                {isToggle(f.key) ? (
                  <FormControlLabel
                    control={<Switch size="small" checked={val === "1"} onChange={(_, v) => setEdited((e) => ({ ...e, [f.key]: v ? "1" : "0" }))} />}
                    label={<Typography variant="caption">{val === "1" ? "On" : "Off"}</Typography>}
                  />
                ) : (
                  <TextField size="small" value={val} onChange={(e) => setEdited((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    sx={{ width: 120 }} inputProps={{ style: { textAlign: "right" } }}
                    InputProps={{ endAdornment: f.unit ? <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{f.unit}</Typography> : undefined }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
};

// ── Main ──────────────────────────────────────────────────────────────

const TAB_SLUGS = ["proxies", "proxy-groups", "macros", "queue", "housekeeping"];

const AdministrationInner = () => {
  const searchParams = useSearchParams();
  const tab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get("tab") ?? ""));
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <SettingsOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Administration</Typography>
          <Typography variant="body2" color="text.secondary">Proxies, proxy groups, global macros, item queue, and housekeeping settings.</Typography>
        </Box>
      </Box>
      <Card>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <ProxiesTab showToast={showToast} />}
          {tab === 1 && <ProxyGroupsTab showToast={showToast} />}
          {tab === 2 && <MacrosTab showToast={showToast} />}
          {tab === 3 && <QueueTab showToast={showToast} />}
          {tab === 4 && <HousekeepingTab showToast={showToast} />}
        </Box>
      </Card>
      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>{toast.message}</Alert>
      </Snackbar>
    </Stack>
  );
};

export const Administration = () => (
  <Suspense fallback={null}>
    <AdministrationInner />
  </Suspense>
);
