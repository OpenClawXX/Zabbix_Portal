"use client";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
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
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "../app/api";

const ConfirmDelete = ({ open, name, onConfirm, onClose }: { open: boolean; name: string; onConfirm: () => void; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle sx={{ fontWeight: 700 }}>Delete?</DialogTitle>
    <DialogContent><Typography>Delete <strong>{name}</strong> and all its children?</Typography></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm}>Delete</Button>
    </DialogActions>
  </Dialog>
);

const STATUS_COLOR: Record<number, string> = {
  0: "#22C55E", 1: "#2196F3", 2: "#FFC107", 3: "#FF5722", 4: "#F44336", 5: "#B71C1C", 6: "#9E9E9E",
};
const STATUS_LABEL: Record<number, string> = {
  0: "OK", 1: "Info", 2: "Warning", 3: "Average", 4: "High", 5: "Disaster", 6: "Not classified", [-1]: "—",
};

// ── Services tab ──────────────────────────────────────────────────────

type Service = { serviceid: string; name: string; algorithm: number; algorithm_label: string; sortorder: number; weight: number; status: number; description: string; children: Array<{ serviceid: string; name: string }>; parents: Array<{ serviceid: string; name: string }> };

const ServicesTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: "", algorithm: 0, sortorder: 0, weight: 0, description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listServices(); setItems(r.services); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      if (editTarget) {
        await api.updateService(editTarget.serviceid, { name: form.name, algorithm: form.algorithm, description: form.description });
        showToast("Service updated.", "success"); setEditTarget(null);
      } else {
        await api.createService(form); showToast("Service created.", "success"); setAddOpen(false);
        setForm({ name: "", algorithm: 0, sortorder: 0, weight: 0, description: "" });
      }
      void load();
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteService(deleteTarget.serviceid); showToast("Service deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Services</Typography>
          {loading ? <CircularProgress size={14} /> : <Chip label={items.length} size="small" sx={{ height: 18, fontSize: "0.62rem" }} />}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh"><IconButton size="small" onClick={load} disabled={loading}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Button size="small" variant="contained" color="secondary" startIcon={<AddOutlinedIcon />} onClick={() => { setForm({ name: "", algorithm: 0, sortorder: 0, weight: 0, description: "" }); setAddOpen(true); }}>Add</Button>
        </Stack>
      </Box>
      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 520, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 160 }}>Algorithm</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Children</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No services configured. Services allow you to group hosts and triggers into a hierarchy with calculated status.</Typography></TableCell></TableRow>
            ) : items.map((s) => {
              const sColor = STATUS_COLOR[s.status] ?? "#9E9E9E";
              return (
                <TableRow key={s.serviceid} hover>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{s.name}</Typography></TableCell>
                  <TableCell>
                    <Chip label={STATUS_LABEL[s.status] ?? "—"} size="small"
                      sx={{ height: 18, fontSize: "0.62rem", color: sColor, bgcolor: `${sColor}18`, border: `1px solid ${sColor}40` }} />
                  </TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{s.algorithm_label}</Typography></TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{s.children.length}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: "block" }}>{s.description || "—"}</Typography></TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditTarget(s); setForm({ name: s.name, algorithm: s.algorithm, sortorder: s.sortorder, weight: s.weight, description: s.description }); }}><EditOutlinedIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(s)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={addOpen || !!editTarget} onClose={() => { setAddOpen(false); setEditTarget(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editTarget ? "Edit service" : "Create service"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Status calculation algorithm</InputLabel>
              <Select label="Status calculation algorithm" value={form.algorithm} onChange={(e) => setForm((f) => ({ ...f, algorithm: Number(e.target.value) }))}>
                <MenuItem value={0}>Set manually</MenuItem>
                <MenuItem value={1}>Most critical of children</MenuItem>
                <MenuItem value={2}>Most critical of child problems</MenuItem>
              </Select>
            </FormControl>
            {!editTarget && (
              <Stack direction="row" spacing={2}>
                <TextField size="small" label="Sort order" type="number" value={form.sortorder} onChange={(e) => setForm((f) => ({ ...f, sortorder: Number(e.target.value) }))} fullWidth />
                <TextField size="small" label="Weight" type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))} fullWidth helperText="Used in weighted calculations" />
              </Stack>
            )}
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} multiline rows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddOpen(false); setEditTarget(null); }}>Cancel</Button>
          <Button variant="contained" onClick={onSave} disabled={saving || !form.name.trim()}>{saving ? <CircularProgress size={14} /> : editTarget ? "Save" : "Create"}</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ""} onConfirm={onDelete} onClose={() => setDeleteTarget(null)} />
    </>
  );
};

// ── SLA tab ───────────────────────────────────────────────────────────

type Sla = { slaid: string; name: string; slo: number; period_label: string; timezone: string; description: string; status: number; service_tags: Array<{ tag: string; value: string }> };

const SlaTab = ({ showToast }: { showToast: (m: string, s: "success" | "error") => void }) => {
  const [items, setItems] = useState<Sla[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sla | null>(null);
  const [form, setForm] = useState({ name: "", slo: 99.9, period: "PERIOD_MONTHLY", timezone: "UTC", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.listSlas(); setItems(r.slas); } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const onSave = async () => {
    setSaving(true);
    try { await api.createSla(form); showToast("SLA created.", "success"); setAddOpen(false); setForm({ name: "", slo: 99.9, period: "PERIOD_MONTHLY", timezone: "UTC", description: "" }); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    try { await api.deleteSla(deleteTarget.slaid); showToast("SLA deleted.", "success"); setDeleteTarget(null); void load(); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>SLA</Typography>
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
              <TableCell sx={{ fontWeight: 700, width: 80 }}>SLO %</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 110 }}>Period</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 100 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Service tags</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>Delete</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>No SLAs defined.</Typography></TableCell></TableRow>
            ) : items.map((s) => (
              <TableRow key={s.slaid} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{s.name}</Typography></TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: s.slo >= 99.9 ? "#22C55E" : s.slo >= 99 ? "#F59E0B" : "#EF4444" }}>{s.slo}%</Typography>
                </TableCell>
                <TableCell><Chip label={s.period_label} size="small" variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} /></TableCell>
                <TableCell><Chip label={s.status === 0 ? "Enabled" : "Disabled"} size="small" color={s.status === 0 ? "success" : "default"} variant="outlined" sx={{ height: 18, fontSize: "0.62rem" }} /></TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                    {s.service_tags.map((t, i) => <Chip key={i} label={`${t.tag}${t.value ? `:${t.value}` : ""}`} size="small" sx={{ height: 16, fontSize: "0.6rem" }} />)}
                    {s.service_tags.length === 0 && <Typography variant="caption" color="text.disabled">—</Typography>}
                  </Box>
                </TableCell>
                <TableCell><Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteTarget(s)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create SLA</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Stack direction="row" spacing={2}>
              <TextField size="small" label="SLO % *" type="number" value={form.slo} onChange={(e) => setForm((f) => ({ ...f, slo: Number(e.target.value) }))} fullWidth inputProps={{ min: 0, max: 100, step: 0.01 }} helperText="e.g. 99.9 for 99.9%" />
              <FormControl size="small" fullWidth>
                <InputLabel>Period</InputLabel>
                <Select label="Period" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as string }))}>
                  <MenuItem value="PERIOD_DAILY">Daily</MenuItem>
                  <MenuItem value="PERIOD_WEEKLY">Weekly</MenuItem>
                  <MenuItem value="PERIOD_MONTHLY">Monthly</MenuItem>
                  <MenuItem value="PERIOD_QUARTERLY">Quarterly</MenuItem>
                  <MenuItem value="PERIOD_ANNUALLY">Annually</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TextField size="small" label="Timezone" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="UTC" />
            <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} multiline rows={2} />
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

// ── Main ──────────────────────────────────────────────────────────────

const TAB_SLUGS = ["services", "sla"];

const ServicesInner = () => {
  const searchParams = useSearchParams();
  const tab = TAB_SLUGS.indexOf(searchParams.get("tab") ?? "") >= 0 ? TAB_SLUGS.indexOf(searchParams.get("tab") ?? "") : 0;
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <AccountTreeOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Services</Typography>
          <Typography variant="body2" color="text.secondary">Service health tree and SLA definitions.</Typography>
        </Box>
      </Box>
      <Card>
        <Box sx={{ p: 2 }}>
          {tab === 0 && <ServicesTab showToast={showToast} />}
          {tab === 1 && <SlaTab showToast={showToast} />}
        </Box>
      </Card>
      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>{toast.message}</Alert>
      </Snackbar>
    </Stack>
  );
};

export const Services = () => (
  <Suspense fallback={null}>
    <ServicesInner />
  </Suspense>
);
