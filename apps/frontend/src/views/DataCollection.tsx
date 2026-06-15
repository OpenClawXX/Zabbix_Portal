"use client";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
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
  List,
  ListItem,
  ListItemText,
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
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "../app/api";

// ── Types ──────────────────────────────────────────────────────────────

type TemplateGroup = { groupid: string; name: string; template_count: number };
type HostGroup = { groupid: string; name: string; host_count: number };
type DcTemplate = {
  templateid: string;
  name: string;
  description: string;
  groups: Array<{ groupid: string; name: string }>;
  linked_templates: Array<{ templateid: string; name: string }>;
};
type Maintenance = {
  maintenanceid: string;
  name: string;
  maintenance_type: string;
  active_since: number;
  active_till: number;
  description: string;
  hosts: Array<{ hostid: string; name: string }>;
  groups: Array<{ groupid: string; name: string }>;
};
type Correlation = {
  correlationid: string;
  name: string;
  description: string;
  status: string;
  condition_count: number;
  operation_count: number;
};
type DiscoveryRule = {
  druleid: string;
  name: string;
  iprange: string;
  delay: string;
  status: string;
  nextcheck: number;
  check_count: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

const fmtTs = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "—";

const StatusChip = ({ status, on = "0", labels = ["Enabled", "Disabled"] }: { status: string; on?: string; labels?: string[] }) => (
  <Chip
    label={status === on ? labels[0] : labels[1]}
    size="small"
    color={status === on ? "success" : "default"}
    variant="outlined"
    sx={{ height: 18, fontSize: "0.62rem" }}
  />
);

// ── Confirm delete dialog ──────────────────────────────────────────────

const ConfirmDelete = ({
  open,
  name,
  onConfirm,
  onClose,
}: {
  open: boolean;
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>Delete?</DialogTitle>
    <DialogContent>
      <Typography>
        Permanently delete <strong>{name}</strong>? This cannot be undone.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm}>
        Delete
      </Button>
    </DialogActions>
  </Dialog>
);

// ── Members dialog ─────────────────────────────────────────────────────

const MembersDialog = <T extends { name: string }>({
  open,
  title,
  items,
  loading,
  onClose,
  renderSecondary,
}: {
  open: boolean;
  title: string;
  items: T[];
  loading: boolean;
  onClose: () => void;
  renderSecondary?: (item: T) => string;
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
    {loading && <LinearProgress />}
    <DialogContent sx={{ pt: 0.5 }}>
      {!loading && items.length === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No items found.</Typography>
      )}
      <List dense disablePadding>
        {items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: display-only list
          <ListItem key={i} disablePadding sx={{ py: 0.25 }}>
            <ListItemText
              primary={<Typography variant="body2">{item.name}</Typography>}
              secondary={renderSecondary ? <Typography variant="caption" color="text.disabled">{renderSecondary(item)}</Typography> : undefined}
            />
          </ListItem>
        ))}
      </List>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

// ── Section header row ─────────────────────────────────────────────────

const SectionHeader = ({
  title,
  count,
  loading,
  onRefresh,
  onAdd,
  addLabel = "Add",
}: {
  title: string;
  count: number;
  loading: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  addLabel?: string;
}) => (
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {loading ? (
        <CircularProgress size={14} />
      ) : (
        <Chip label={count} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />
      )}
    </Box>
    <Stack direction="row" spacing={1}>
      <Tooltip title="Refresh">
        <IconButton size="small" onClick={onRefresh} disabled={loading}>
          <RefreshIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={onAdd}>
        {addLabel}
      </Button>
    </Stack>
  </Box>
);

// ── Template Groups tab ────────────────────────────────────────────────

const TemplateGroupsTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TemplateGroup | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateGroup | null>(null);
  const [viewGroup, setViewGroup] = useState<TemplateGroup | null>(null);
  const [members, setMembers] = useState<Array<{ templateid: string; name: string; description: string }>>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listTemplateGroups();
      setGroups(r.groups);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const openView = async (g: TemplateGroup) => {
    setViewGroup(g);
    setMembersLoading(true);
    try { const r = await api.getTemplateGroupMembers(g.groupid); setMembers(r.templates); }
    catch { setMembers([]); } finally { setMembersLoading(false); }
  };

  const onSave = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateTemplateGroup(editTarget.groupid, name);
        showToast("Template group renamed.", "success");
      } else {
        await api.createTemplateGroup(name);
        showToast("Template group created.", "success");
      }
      setAddOpen(false);
      setEditTarget(null);
      setNameInput("");
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteTemplateGroup(deleteTarget.groupid);
      showToast("Template group deleted.", "success");
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      <SectionHeader title="Template Groups" count={groups.length} loading={loading} onRefresh={load} onAdd={() => { setEditTarget(null); setNameInput(""); setAddOpen(true); }} />
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Templates</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No template groups found.</Typography></TableCell></TableRow>
            ) : groups.map((g) => (
              <TableRow key={g.groupid} hover sx={{ cursor: "pointer" }} onClick={() => openView(g)}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{g.name}</Typography></TableCell>
                <TableCell>
                  <Chip label={g.template_count} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem", cursor: "pointer" }} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="View templates"><IconButton size="small" onClick={() => openView(g)}><VisibilityOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Rename"><IconButton size="small" onClick={() => { setEditTarget(g); setNameInput(g.name); setAddOpen(true); }}><EditOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(g)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <MembersDialog
        open={!!viewGroup}
        title={`Templates in "${viewGroup?.name ?? ""}"`}
        items={members}
        loading={membersLoading}
        onClose={() => setViewGroup(null)}
        renderSecondary={(t) => (t as { description: string }).description || ""}
      />
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editTarget ? "Rename template group" : "Add template group"}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label="Name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} sx={{ mt: 1 }} onKeyDown={(e) => e.key === "Enter" && onSave()} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !nameInput.trim()}>
            {saving ? <CircularProgress size={14} /> : editTarget ? "Rename" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Host Groups tab ────────────────────────────────────────────────────

const HostGroupsTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HostGroup | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HostGroup | null>(null);
  const [viewGroup, setViewGroup] = useState<HostGroup | null>(null);
  const [members, setMembers] = useState<Array<{ hostid: string; host: string; name: string; status: number }>>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listHostGroups();
      setGroups(r.groups);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const openView = async (g: HostGroup) => {
    setViewGroup(g);
    setMembersLoading(true);
    try { const r = await api.getHostGroupMembers(g.groupid); setMembers(r.hosts); }
    catch { setMembers([]); } finally { setMembersLoading(false); }
  };

  const onSave = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateHostGroup(editTarget.groupid, name);
        showToast("Host group renamed.", "success");
      } else {
        await api.createHostGroup(name);
        showToast("Host group created.", "success");
      }
      setAddOpen(false);
      setEditTarget(null);
      setNameInput("");
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteHostGroup(deleteTarget.groupid);
      showToast("Host group deleted.", "success");
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      <SectionHeader title="Host Groups" count={groups.length} loading={loading} onRefresh={load} onAdd={() => { setEditTarget(null); setNameInput(""); setAddOpen(true); }} />
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Hosts</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No host groups found.</Typography></TableCell></TableRow>
            ) : groups.map((g) => (
              <TableRow key={g.groupid} hover sx={{ cursor: "pointer" }} onClick={() => openView(g)}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{g.name}</Typography></TableCell>
                <TableCell>
                  <Chip label={g.host_count} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem", cursor: "pointer" }} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="View hosts"><IconButton size="small" onClick={() => openView(g)}><VisibilityOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Rename"><IconButton size="small" onClick={() => { setEditTarget(g); setNameInput(g.name); setAddOpen(true); }}><EditOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(g)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <MembersDialog
        open={!!viewGroup}
        title={`Hosts in "${viewGroup?.name ?? ""}"`}
        items={members.map((h) => ({ ...h, name: h.host || h.name }))}
        loading={membersLoading}
        onClose={() => setViewGroup(null)}
        renderSecondary={(h) => (h as { name: string; host: string; status: number }).status === 0 ? "Monitored" : "Not monitored"}
      />
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editTarget ? "Rename host group" : "Add host group"}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label="Name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} sx={{ mt: 1 }} onKeyDown={(e) => e.key === "Enter" && onSave()} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !nameInput.trim()}>
            {saving ? <CircularProgress size={14} /> : editTarget ? "Rename" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Templates tab ──────────────────────────────────────────────────────

const makeEmptyTemplateForm = () => ({
  name: "",
  visible_name: "",
  group_ids: [] as string[],
  template_ids: [] as string[],
  description: "",
  tags: [] as Array<{ tag: string; value: string }>,
  macros: [] as Array<{ macro: string; value: string; description: string }>,
});

const TemplatesTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [templates, setTemplates] = useState<DcTemplate[]>([]);
  const [tplGroups, setTplGroups] = useState<TemplateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DcTemplate | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(makeEmptyTemplateForm());
  const [dialogTab, setDialogTab] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, gr] = await Promise.all([api.listDcTemplates(), api.listTemplateGroups()]);
      setTemplates(tr.templates);
      setTplGroups(gr.groups);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = templates.filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => {
    setForm(makeEmptyTemplateForm());
    setDialogTab(0);
    setAddOpen(true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createDcTemplate({
        name: form.name,
        visible_name: form.visible_name || undefined,
        group_ids: form.group_ids,
        template_ids: form.template_ids.length ? form.template_ids : undefined,
        description: form.description || undefined,
        tags: form.tags.filter((t) => t.tag).length ? form.tags.filter((t) => t.tag) : undefined,
        macros: form.macros.filter((m) => m.macro).length ? form.macros.filter((m) => m.macro) : undefined,
      });
      showToast("Template created.", "success");
      setAddOpen(false);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteDcTemplate(deleteTarget.templateid);
      showToast("Template deleted.", "success");
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Templates</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={filtered.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField size="small" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 180 }} />
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={openAdd}>Add</Button>
        </Stack>
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 480, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Groups</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Linked templates</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No templates found.</Typography></TableCell></TableRow>
            ) : filtered.map((t) => (
              <TableRow key={t.templateid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{t.name}</Typography></TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                    {t.groups.map((g) => <Chip key={g.groupid} label={g.name} size="small" variant="outlined" sx={{ height: 16, fontSize: "0.6rem" }} />)}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                    {t.linked_templates.map((lt) => <Chip key={lt.templateid} label={lt.name} size="small" sx={{ height: 16, fontSize: "0.6rem" }} />)}
                    {t.linked_templates.length === 0 && <Typography variant="caption" color="text.disabled">—</Typography>}
                  </Box>
                </TableCell>
                <TableCell>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(t)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create template — full tabbed dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight: "90vh" } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>Create template</DialogTitle>
        <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} sx={{ px: 3, borderBottom: "1px solid", borderColor: "divider", minHeight: 36 }} TabIndicatorProps={{ style: { height: 2 } }}>
          <Tab label="Template" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Tags" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Macros" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
          <Tab label="Value mapping" sx={{ fontSize: "0.8rem", textTransform: "none", minHeight: 36, py: 0.5 }} />
        </Tabs>
        <DialogContent sx={{ minHeight: 300 }}>
          {/* Tab 0 — Template */}
          {dialogTab === 0 && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                size="small"
                label="Template name *"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                helperText="Technical name used in Zabbix API and expressions"
              />
              <TextField
                size="small"
                label="Visible name"
                value={form.visible_name}
                onChange={(e) => setForm((f) => ({ ...f, visible_name: e.target.value }))}
                helperText="Display name shown in the UI (defaults to template name if empty)"
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Template groups *</InputLabel>
                <Select
                  multiple
                  label="Template groups *"
                  value={form.group_ids}
                  onChange={(e) => setForm((f) => ({ ...f, group_ids: e.target.value as string[] }))}
                  renderValue={(selected) => (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {(selected as string[]).map((id) => {
                        const g = tplGroups.find((g) => g.groupid === id);
                        return <Chip key={id} label={g?.name ?? id} size="small" sx={{ height: 20 }} />;
                      })}
                    </Box>
                  )}
                >
                  {tplGroups.map((g) => <MenuItem key={g.groupid} value={g.groupid}>{g.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Linked templates</InputLabel>
                <Select
                  multiple
                  label="Linked templates"
                  value={form.template_ids}
                  onChange={(e) => setForm((f) => ({ ...f, template_ids: e.target.value as string[] }))}
                  renderValue={(selected) => (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {(selected as string[]).map((id) => {
                        const t = templates.find((t) => t.templateid === id);
                        return <Chip key={id} label={t?.name ?? id} size="small" sx={{ height: 20 }} />;
                      })}
                    </Box>
                  )}
                >
                  {templates.map((t) => <MenuItem key={t.templateid} value={t.templateid}>{t.name}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                multiline
                rows={3}
              />
            </Stack>
          )}

          {/* Tab 1 — Tags */}
          {dialogTab === 1 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Template-level tags applied to all problems from this template:</Typography>
              {form.tags.map((tag, idx) => (
                <Stack key={`tag-${idx}`} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <TextField
                    size="small"
                    label="Name"
                    value={tag.tag}
                    onChange={(e) => setForm((f) => ({ ...f, tags: f.tags.map((t, i) => i === idx ? { ...t, tag: e.target.value } : t) }))}
                    sx={{ width: 200 }}
                  />
                  <TextField
                    size="small"
                    label="Value"
                    value={tag.value}
                    onChange={(e) => setForm((f) => ({ ...f, tags: f.tags.map((t, i) => i === idx ? { ...t, value: e.target.value } : t) }))}
                    sx={{ width: 200 }}
                  />
                  <IconButton size="small" color="error" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((_, i) => i !== idx) }))}>
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" variant="outlined" startIcon={<AddOutlinedIcon />} onClick={() => setForm((f) => ({ ...f, tags: [...f.tags, { tag: "", value: "" }] }))}>
                Add tag
              </Button>
            </Box>
          )}

          {/* Tab 2 — Macros */}
          {dialogTab === 2 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>User macros defined at the template level:</Typography>
              {form.macros.map((macro, idx) => (
                <Stack key={`macro-${idx}`} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <TextField
                    size="small"
                    label="Macro"
                    placeholder="{$MACRO_NAME}"
                    value={macro.macro}
                    onChange={(e) => setForm((f) => ({ ...f, macros: f.macros.map((m, i) => i === idx ? { ...m, macro: e.target.value } : m) }))}
                    sx={{ width: 180 }}
                  />
                  <TextField
                    size="small"
                    label="Value"
                    value={macro.value}
                    onChange={(e) => setForm((f) => ({ ...f, macros: f.macros.map((m, i) => i === idx ? { ...m, value: e.target.value } : m) }))}
                    sx={{ width: 180 }}
                  />
                  <TextField
                    size="small"
                    label="Description"
                    value={macro.description}
                    onChange={(e) => setForm((f) => ({ ...f, macros: f.macros.map((m, i) => i === idx ? { ...m, description: e.target.value } : m) }))}
                    sx={{ width: 180 }}
                  />
                  <IconButton size="small" color="error" onClick={() => setForm((f) => ({ ...f, macros: f.macros.filter((_, i) => i !== idx) }))}>
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" variant="outlined" startIcon={<AddOutlinedIcon />} onClick={() => setForm((f) => ({ ...f, macros: [...f.macros, { macro: "", value: "", description: "" }] }))}>
                Add macro
              </Button>
            </Box>
          )}

          {/* Tab 3 — Value mapping (info only — set on items after template is created) */}
          {dialogTab === 3 && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="info">Value mappings are configured per-item after the template is created. Use the Items view to add value maps to individual items within this template.</Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim() || !form.group_ids.length}>
            {saving ? <CircularProgress size={14} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Maintenance tab ────────────────────────────────────────────────────

const MaintenanceTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Maintenance[]>([]);
  const [hostGroups, setHostGroups] = useState<HostGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Maintenance | null>(null);

  const nowIso = () => new Date(Date.now() + 60000).toISOString().slice(0, 16);
  const laterIso = () => new Date(Date.now() + 3600000).toISOString().slice(0, 16);

  const [form, setForm] = useState({
    name: "",
    maintenance_type: 0,
    active_since_str: nowIso(),
    active_till_str: laterIso(),
    groupids: [] as string[],
    description: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mr, gr] = await Promise.all([api.listMaintenances(), api.listHostGroups()]);
      setItems(mr.maintenances);
      setHostGroups(gr.groups);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      const since = Math.floor(new Date(form.active_since_str).getTime() / 1000);
      const till = Math.floor(new Date(form.active_till_str).getTime() / 1000);
      await api.createMaintenance({
        name: form.name,
        maintenance_type: form.maintenance_type,
        active_since: since,
        active_till: till,
        groupids: form.groupids,
        description: form.description,
      });
      showToast("Maintenance created.", "success");
      setAddOpen(false);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteMaintenance(deleteTarget.maintenanceid);
      showToast("Maintenance deleted.", "success");
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      <SectionHeader title="Maintenance" count={items.length} loading={loading} onRefresh={load} onAdd={() => { setForm({ name: "", maintenance_type: 0, active_since_str: nowIso(), active_till_str: laterIso(), groupids: [], description: "" }); setAddOpen(true); }} />
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 480, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Active from</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Active till</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Scope</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No maintenances found.</Typography></TableCell></TableRow>
            ) : items.map((m) => (
              <TableRow key={m.maintenanceid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{m.name}</Typography></TableCell>
                <TableCell>
                  <Chip label={m.maintenance_type === "0" ? "With data" : "No data"} size="small" variant="outlined" color={m.maintenance_type === "0" ? "info" : "warning"} sx={{ height: 18, fontSize: "0.62rem" }} />
                </TableCell>
                <TableCell><Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>{fmtTs(m.active_since)}</Typography></TableCell>
                <TableCell><Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>{fmtTs(m.active_till)}</Typography></TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {[...m.hosts.map((h) => h.name), ...m.groups.map((g) => g.name)].join(", ") || "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(m)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create maintenance</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={form.maintenance_type} onChange={(e) => setForm((f) => ({ ...f, maintenance_type: Number(e.target.value) }))}>
                <MenuItem value={0}>With data collection</MenuItem>
                <MenuItem value={1}>No data collection</MenuItem>
              </Select>
            </FormControl>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Active from" type="datetime-local" value={form.active_since_str} onChange={(e) => setForm((f) => ({ ...f, active_since_str: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Active till" type="datetime-local" value={form.active_till_str} onChange={(e) => setForm((f) => ({ ...f, active_till_str: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
            </Stack>
            <FormControl size="small" fullWidth>
              <InputLabel>Host groups</InputLabel>
              <Select
                multiple
                label="Host groups"
                value={form.groupids}
                onChange={(e) => setForm((f) => ({ ...f, groupids: e.target.value as string[] }))}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {(selected as string[]).map((id) => {
                      const g = hostGroups.find((g) => g.groupid === id);
                      return <Chip key={id} label={g?.name ?? id} size="small" sx={{ height: 20 }} />;
                    })}
                  </Box>
                )}
              >
                {hostGroups.map((g) => <MenuItem key={g.groupid} value={g.groupid}>{g.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} multiline rows={2} />
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

// ── Event Correlation tab ──────────────────────────────────────────────

type CorrCondition = { type: number; operator: number; tag: string; value: string };
const COND_TYPE_LABELS: Record<number, string> = { 0: "Old event tag", 1: "New event tag", 2: "New event tag value", 3: "Old event tag value" };
const COND_OP_LABELS: Record<number, string> = { 0: "equals", 1: "does not equal", 2: "contains", 3: "does not contain" };
const EMPTY_CONDITION: CorrCondition = { type: 1, operator: 0, tag: "", value: "" };

const CorrelationTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Correlation[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Correlation | null>(null);
  const [form, setForm] = useState({ name: "", description: "", status: 0, evaltype: 0, operation_type: 0 });
  const [conditions, setConditions] = useState<CorrCondition[]>([{ ...EMPTY_CONDITION }]);

  const resetForm = () => {
    setForm({ name: "", description: "", status: 0, evaltype: 0, operation_type: 0 });
    setConditions([{ ...EMPTY_CONDITION }]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listCorrelations();
      setItems(r.correlations);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createCorrelation({ ...form, conditions });
      showToast("Correlation created.", "success");
      setAddOpen(false);
      resetForm();
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteCorrelation(deleteTarget.correlationid);
      showToast("Correlation deleted.", "success");
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const updateCond = (i: number, patch: Partial<CorrCondition>) =>
    setConditions((cs) => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  return (
    <>
      <SectionHeader title="Event Correlation" count={items.length} loading={loading} onRefresh={load} onAdd={() => { resetForm(); setAddOpen(true); }} />
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Conditions</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Operations</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No correlations found.</Typography></TableCell></TableRow>
            ) : items.map((c) => (
              <TableRow key={c.correlationid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{c.name}</Typography></TableCell>
                <TableCell><StatusChip status={c.status} /></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{c.condition_count}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{c.operation_count}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: "block" }}>{c.description || "—"}</Typography></TableCell>
                <TableCell>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(c)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create correlation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={<Switch checked={form.status === 0} onChange={(_, v) => setForm((f) => ({ ...f, status: v ? 0 : 1 }))} size="small" />}
                label={<Typography variant="body2">Enabled</Typography>}
              />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Operation</InputLabel>
                <Select label="Operation" value={form.operation_type} onChange={(e) => setForm((f) => ({ ...f, operation_type: Number(e.target.value) }))}>
                  <MenuItem value={0}>Close new event</MenuItem>
                  <MenuItem value={1}>Close old events</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Divider />
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Conditions</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {conditions.length > 1 && (
                  <FormControl size="small" sx={{ minWidth: 80 }}>
                    <InputLabel sx={{ fontSize: "0.75rem" }}>Match</InputLabel>
                    <Select label="Match" value={form.evaltype} onChange={(e) => setForm((f) => ({ ...f, evaltype: Number(e.target.value) }))} sx={{ fontSize: "0.78rem" }}>
                      <MenuItem value={0}>AND / OR</MenuItem>
                      <MenuItem value={1}>AND</MenuItem>
                      <MenuItem value={2}>OR</MenuItem>
                    </Select>
                  </FormControl>
                )}
                <Button size="small" variant="outlined" onClick={() => setConditions((cs) => [...cs, { ...EMPTY_CONDITION }])}>+ Add</Button>
              </Stack>
            </Box>
            {conditions.map((cond, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: condition list index is stable during dialog lifecycle
              <Box key={i} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 170 }}>
                      <InputLabel>Type</InputLabel>
                      <Select label="Type" value={cond.type} onChange={(e) => updateCond(i, { type: Number(e.target.value) })}>
                        {Object.entries(COND_TYPE_LABELS).map(([k, v]) => <MenuItem key={k} value={Number(k)}>{v}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel>Operator</InputLabel>
                      <Select label="Operator" value={cond.operator} onChange={(e) => updateCond(i, { operator: Number(e.target.value) })}>
                        {Object.entries(COND_OP_LABELS).map(([k, v]) => <MenuItem key={k} value={Number(k)}>{v}</MenuItem>)}
                      </Select>
                    </FormControl>
                    {conditions.length > 1 && (
                      <IconButton size="small" color="error" onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}>
                        <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <TextField size="small" label="Tag name" value={cond.tag} onChange={(e) => updateCond(i, { tag: e.target.value })} fullWidth placeholder="e.g. service" />
                    <TextField size="small" label="Tag value" value={cond.value} onChange={(e) => updateCond(i, { value: e.target.value })} fullWidth placeholder="e.g. nginx" />
                  </Stack>
                </Stack>
              </Box>
            ))}
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} multiline rows={2} />
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

// ── Discovery tab ──────────────────────────────────────────────────────

const CHECK_TYPE_OPTIONS = ["icmp", "ssh", "http", "https", "ftp", "smtp", "snmp", "telnet", "tcp", "zabbix", "ldap"];

const DiscoveryTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [rules, setRules] = useState<DiscoveryRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryRule | null>(null);
  const [form, setForm] = useState({ name: "", iprange: "", delay: "1h", check_types: ["icmp"] as string[], ports: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listDiscoveryRules();
      setRules(r.rules);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.createDiscoveryRule(form);
      showToast("Discovery rule created.", "success");
      setAddOpen(false);
      setForm({ name: "", iprange: "", delay: "1h", check_types: ["icmp"], ports: "" });
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteDiscoveryRule(deleteTarget.druleid);
      showToast("Discovery rule deleted.", "success");
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <>
      <SectionHeader title="Discovery" count={rules.length} loading={loading} onRefresh={load} onAdd={() => { setForm({ name: "", iprange: "", delay: "1h", check_types: ["icmp"], ports: "" }); setAddOpen(true); }} addLabel="Add rule" />
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>IP range</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Interval</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Checks</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Next run</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No discovery rules found.</Typography></TableCell></TableRow>
            ) : rules.map((r) => (
              <TableRow key={r.druleid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography></TableCell>
                <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{r.iprange}</Typography></TableCell>
                <TableCell><Typography variant="body2">{r.delay}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{r.check_count}</Typography></TableCell>
                <TableCell><StatusChip status={r.status} labels={["Active", "Disabled"]} /></TableCell>
                <TableCell><Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>{r.nextcheck ? fmtTs(r.nextcheck) : "—"}</Typography></TableCell>
                <TableCell>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(r)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create discovery rule</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Rule name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField size="small" label="IP range *" value={form.iprange} onChange={(e) => setForm((f) => ({ ...f, iprange: e.target.value }))} placeholder="e.g. 192.168.1.1-254" helperText="Supports ranges (1-254), CIDR (192.168.1.0/24), or single IPs" />
            <TextField size="small" label="Interval" value={form.delay} onChange={(e) => setForm((f) => ({ ...f, delay: e.target.value }))} placeholder="e.g. 1h, 30m" helperText="How often to run the discovery scan" />
            <FormControl size="small" fullWidth>
              <InputLabel>Check types *</InputLabel>
              <Select
                multiple
                label="Check types *"
                value={form.check_types}
                onChange={(e) => setForm((f) => ({ ...f, check_types: e.target.value as string[] }))}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {(selected as string[]).map((ct) => <Chip key={ct} label={ct.toUpperCase()} size="small" sx={{ height: 20 }} />)}
                  </Box>
                )}
              >
                {CHECK_TYPE_OPTIONS.map((ct) => <MenuItem key={ct} value={ct}>{ct.toUpperCase()}</MenuItem>)}
              </Select>
            </FormControl>
            {form.check_types.some((ct) => ct !== "icmp") && (
              <TextField size="small" label="Ports" value={form.ports} onChange={(e) => setForm((f) => ({ ...f, ports: e.target.value }))} placeholder="e.g. 22,80,443" helperText="Comma-separated ports for non-ICMP checks" />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim() || !form.iprange.trim() || !form.check_types.length}>
            {saving ? <CircularProgress size={14} /> : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── Main view ──────────────────────────────────────────────────────────

const TAB_SLUGS = ["template-groups", "host-groups", "templates", "maintenance", "event-correlation", "discovery"];

const DataCollectionInner = () => {
  const searchParams = useSearchParams();
  const tab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get("tab") ?? ""));
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <StorageOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Data Collection</Typography>
          <Typography variant="body2" color="text.secondary">Manage template groups, host groups, templates, maintenance windows, event correlations, and discovery rules.</Typography>
        </Box>
      </Box>

      <Card>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <TemplateGroupsTab showToast={showToast} />}
          {tab === 1 && <HostGroupsTab showToast={showToast} />}
          {tab === 2 && <TemplatesTab showToast={showToast} />}
          {tab === 3 && <MaintenanceTab showToast={showToast} />}
          {tab === 4 && <CorrelationTab showToast={showToast} />}
          {tab === 5 && <DiscoveryTab showToast={showToast} />}
        </Box>
      </Card>

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export const DataCollection = () => (
  <Suspense fallback={null}>
    <DataCollectionInner />
  </Suspense>
);
