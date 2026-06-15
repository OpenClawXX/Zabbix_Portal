"use client";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
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
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
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
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "../app/api";

const ConfirmDelete = ({ open, name, onConfirm, onClose }: { open: boolean; name: string; onConfirm: () => void; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>Delete?</DialogTitle>
    <DialogContent><Typography>Permanently delete <strong>{name}</strong>? This cannot be undone.</Typography></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm}>Delete</Button>
    </DialogActions>
  </Dialog>
);

const StatusChip = ({ status }: { status: number }) => (
  <Chip label={status === 0 ? "Enabled" : "Disabled"} size="small" color={status === 0 ? "success" : "default"} variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} />
);

// ── Actions tabs ──────────────────────────────────────────────────────

type Action = { actionid: string; name: string; eventsource: number; eventsource_label: string; status: number; esc_period: string; condition_count: number; operation_count: number };

const ActionsPanel = ({ eventsource, title, showToast }: { eventsource: number; title: string; showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Action | null>(null);
  const [form, setForm] = useState({ name: "", esc_period: "1h" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listActions(eventsource); setItems(r.actions); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [eventsource, showToast]);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createAction({ name: form.name, eventsource, esc_period: form.esc_period });
      showToast("Action created.", "success"); setAddOpen(false); setForm({ name: "", esc_period: "1h" }); void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteAction(deleteTarget.actionid); showToast("Action deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  const onToggle = async (a: Action) => {
    try { await api.toggleAction(a.actionid, a.status === 0 ? 1 : 0); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
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
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Escalation</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Conditions</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 90 }}>Operations</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No {title.toLowerCase()} found.</Typography></TableCell></TableRow>
            ) : items.map((a) => (
              <TableRow key={a.actionid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{a.name}</Typography></TableCell>
                <TableCell><StatusChip status={a.status} /></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{a.esc_period}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{a.condition_count}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{a.operation_count}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title={a.status === 0 ? "Disable" : "Enable"}>
                      <IconButton size="small" onClick={() => onToggle(a)}>{a.status === 0 ? <ToggleOnOutlinedIcon sx={{ fontSize: 16, color: "success.main" }} /> : <ToggleOffOutlinedIcon sx={{ fontSize: 16 }} />}</IconButton>
                    </Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(a)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create {title.toLowerCase().replace(" actions", " action")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField size="small" label="Escalation period" value={form.esc_period} onChange={(e) => setForm((f) => ({ ...f, esc_period: e.target.value }))} helperText="e.g. 1h, 30m" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim()}>
            {saving ? <CircularProgress size={14} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Media Types ───────────────────────────────────────────────────────

type MediaType = { mediatypeid: string; name: string; type: number; type_label: string; status: number; description: string };

const MediaTypesTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<MediaType[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaType | null>(null);
  const [form, setForm] = useState({ name: "", type: 0, description: "", smtp_server: "", smtp_email: "", script: "", webhook_script: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listMediaTypes(); setItems(r.media_types); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createMediaType(form); showToast("Media type created.", "success"); setAddOpen(false);
      setForm({ name: "", type: 0, description: "", smtp_server: "", smtp_email: "", script: "", webhook_script: "" }); void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteMediaType(deleteTarget.mediatypeid); showToast("Media type deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };
  const onToggle = async (m: MediaType) => {
    try { await api.toggleMediaType(m.mediatypeid, m.status === 0 ? 1 : 0); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  const TYPE_ICONS: Record<number, string> = { 0: "📧", 1: "💬", 2: "📜", 4: "🔗", 5: "💼", 6: "💬" };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Media Types</Typography>
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
              <TableCell sx={{ fontWeight: 700, width: 110 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No media types found.</Typography></TableCell></TableRow>
            ) : items.map((m) => (
              <TableRow key={m.mediatypeid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{m.name}</Typography></TableCell>
                <TableCell><Typography variant="body2">{TYPE_ICONS[m.type] ?? "📦"} {m.type_label}</Typography></TableCell>
                <TableCell><StatusChip status={m.status} /></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 240, display: "block" }}>{m.description || "—"}</Typography></TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title={m.status === 0 ? "Disable" : "Enable"}>
                      <IconButton size="small" onClick={() => onToggle(m)}>{m.status === 0 ? <ToggleOnOutlinedIcon sx={{ fontSize: 16, color: "success.main" }} /> : <ToggleOffOutlinedIcon sx={{ fontSize: 16 }} />}</IconButton>
                    </Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(m)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create media type</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Type *</InputLabel>
              <Select label="Type *" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: Number(e.target.value) }))}>
                <MenuItem value={0}>Email</MenuItem>
                <MenuItem value={2}>Script</MenuItem>
                <MenuItem value={4}>Webhook</MenuItem>
              </Select>
            </FormControl>
            {form.type === 0 && <>
              <TextField size="small" label="SMTP server" value={form.smtp_server} onChange={(e) => setForm((f) => ({ ...f, smtp_server: e.target.value }))} />
              <TextField size="small" label="SMTP email (from)" value={form.smtp_email} onChange={(e) => setForm((f) => ({ ...f, smtp_email: e.target.value }))} />
            </>}
            {form.type === 2 && <TextField size="small" label="Script path" value={form.script} onChange={(e) => setForm((f) => ({ ...f, script: e.target.value }))} placeholder="/usr/local/bin/notify.sh" />}
            {form.type === 4 && <TextField size="small" label="Webhook script" value={form.webhook_script} onChange={(e) => setForm((f) => ({ ...f, webhook_script: e.target.value }))} multiline rows={3} placeholder="var params = JSON.parse(value); ..." />}
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
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

// ── Scripts ───────────────────────────────────────────────────────────

type Script = { scriptid: string; name: string; command: string; execute_on_label: string; scope_label: string; description: string };

const ScriptsTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Script[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Script | null>(null);
  const [form, setForm] = useState({ name: "", command: "", execute_on: 1, scope: 2, description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listScripts(); setItems(r.scripts); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createScript(form); showToast("Script created.", "success"); setAddOpen(false);
      setForm({ name: "", command: "", execute_on: 1, scope: 2, description: "" }); void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteScript(deleteTarget.scriptid); showToast("Script deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Scripts</Typography>
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
              <TableCell sx={{ fontWeight: 700 }}>Command</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 110 }}>Execute on</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 130 }}>Scope</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No scripts found.</Typography></TableCell></TableRow>
            ) : items.map((s) => (
              <TableRow key={s.scriptid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{s.name}</Typography></TableCell>
                <TableCell><Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }} noWrap>{s.command}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{s.execute_on_label}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{s.scope_label}</Typography></TableCell>
                <TableCell>
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(s)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create script</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField size="small" label="Command *" value={form.command} onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} multiline rows={3} placeholder="sh -c 'ping -c 3 {HOST.CONN}'" />
            <Stack direction="row" spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Execute on</InputLabel>
                <Select label="Execute on" value={form.execute_on} onChange={(e) => setForm((f) => ({ ...f, execute_on: Number(e.target.value) }))}>
                  <MenuItem value={0}>Agent</MenuItem>
                  <MenuItem value={1}>Server</MenuItem>
                  <MenuItem value={2}>Proxy or server</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Scope</InputLabel>
                <Select label="Scope" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: Number(e.target.value) }))}>
                  <MenuItem value={1}>Action operation</MenuItem>
                  <MenuItem value={2}>Manual host</MenuItem>
                  <MenuItem value={4}>Manual event</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim() || !form.command.trim()}>{saving ? <CircularProgress size={14} /> : "Create"}</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Main ──────────────────────────────────────────────────────────────

const TAB_SLUGS = ["trigger-actions", "service-actions", "discovery-actions", "autoregistration", "internal", "media-types", "scripts"];

const AlertsManagementInner = () => {
  const searchParams = useSearchParams();
  const tab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get("tab") ?? ""));
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <NotificationsActiveOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Alerts</Typography>
          <Typography variant="body2" color="text.secondary">Trigger, service, discovery, autoregistration, and internal actions; media types and scripts.</Typography>
        </Box>
      </Box>
      <Card>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <ActionsPanel eventsource={0} title="Trigger Actions" showToast={showToast} />}
          {tab === 1 && <ActionsPanel eventsource={4} title="Service Actions" showToast={showToast} />}
          {tab === 2 && <ActionsPanel eventsource={1} title="Discovery Actions" showToast={showToast} />}
          {tab === 3 && <ActionsPanel eventsource={2} title="Autoregistration Actions" showToast={showToast} />}
          {tab === 4 && <ActionsPanel eventsource={3} title="Internal Actions" showToast={showToast} />}
          {tab === 5 && <MediaTypesTab showToast={showToast} />}
          {tab === 6 && <ScriptsTab showToast={showToast} />}
        </Box>
      </Card>
      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>{toast.message}</Alert>
      </Snackbar>
    </Stack>
  );
};

export const AlertsManagement = () => (
  <Suspense fallback={null}>
    <AlertsManagementInner />
  </Suspense>
);
