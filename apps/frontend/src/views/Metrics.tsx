"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Skeleton,
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
import { useTheme } from "@mui/material/styles";
import {
  CategoryScale,
  Chart as ChartJS,
  Tooltip as ChartTooltip,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
} from "chart.js";
import { useCallback, useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import ReactGridLayout, { WidthProvider } from "react-grid-layout";
import {
  type AlertEvent,
  type AlertRule,
  type Host,
  type ItemHistory,
  type MetricWidgetConfig,
  type Problem,
  api,
} from "../app/api";

const GridLayout = WidthProvider(ReactGridLayout);

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler,
);

const metricsGlowPlugin = {
  id: "metricsGlow",
  beforeDatasetDraw: (
    chart: { ctx: CanvasRenderingContext2D; data: { datasets: { borderColor?: unknown }[] } },
    args: { index: number },
  ) => {
    const color = chart.data.datasets[args.index]?.borderColor;
    if (typeof color !== "string") return;
    chart.ctx.save();
    chart.ctx.shadowBlur = 14;
    chart.ctx.shadowColor = color;
  },
  afterDatasetDraw: (chart: { ctx: CanvasRenderingContext2D }) => {
    chart.ctx.restore();
  },
};

// ── Constants ────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "1 m", minutes: 1 },
  { label: "5 m", minutes: 5 },
  { label: "15 m", minutes: 15 },
  { label: "30 m", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "3 h", minutes: 180 },
  { label: "6 h", minutes: 360 },
  { label: "12 h", minutes: 720 },
  { label: "24 h", minutes: 1440 },
  { label: "7 d", minutes: 10080 },
] as const;

const SEVERITY_CONFIG = [
  { severity: 5, label: "Critical", color: "#B71C1C", bg: "rgba(183,28,28,0.12)" },
  { severity: 4, label: "High", color: "#F44336", bg: "rgba(244,67,54,0.12)" },
  { severity: 3, label: "Medium", color: "#FF5722", bg: "rgba(255,87,34,0.12)" },
  { severity: 2, label: "Low", color: "#FFC107", bg: "rgba(255,193,7,0.12)" },
  { severity: 1, label: "Info", color: "#2196F3", bg: "rgba(33,150,243,0.12)" },
  { severity: 0, label: "None", color: "#9E9E9E", bg: "rgba(158,158,158,0.12)" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────

type ItemDef = {
  itemid: string;
  name: string;
  key_: string;
  value_type: string;
  delay: string;
};

// ── Helpers ───────────────────────────────────────────────────────────

const formatAge = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
};

const formatTimestamp = (clock: number): string =>
  new Date(clock * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// ── Severity chip ─────────────────────────────────────────────────────

const SeverityChip = ({ severity }: { severity: number }) => {
  const cfg = SEVERITY_CONFIG.find((s) => s.severity === severity) ?? SEVERITY_CONFIG[5];
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        height: 20,
        fontSize: "0.68rem",
        fontWeight: 700,
        color: cfg.color,
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.color}40`,
      }}
    />
  );
};

// ── Item chart ────────────────────────────────────────────────────────

const ItemChart = ({
  itemid,
  minutes,
  alertEvents = [],
}: {
  itemid: string;
  minutes: number;
  alertEvents?: import("../app/api").AlertEvent[];
}) => {
  const { palette } = useTheme();
  const isDark = palette.mode === "dark";
  const chartBg = isDark ? "#0D1B2A" : "#F1F5F9";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  // Light mode needs a clearly dark tick so the time axis doesn't blend into the
  // pale chart background; dark mode needs a light-enough slate for contrast.
  const tickColor = isDark ? "#94A3B8" : "#334155";

  const [data, setData] = useState<ItemHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const doFetch = (isInitial: boolean) => {
      if (isInitial) {
        setLoading(true);
        setData(null);
      } else {
        setRefreshing(true);
      }
      api
        .getItemHistory(itemid, minutes)
        .then((res) => {
          if (!cancelled) {
            setData(res);
            if (isInitial) setLoading(false);
            else setRefreshing(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            if (isInitial) {
              setData(null);
              setLoading(false);
            } else setRefreshing(false);
          }
        });
    };

    doFetch(true);

    const intervalMs =
      minutes <= 1 ? 5_000 : minutes <= 5 ? 10_000 : minutes <= 30 ? 30_000 : 60_000;
    const timer = setInterval(() => doFetch(false), intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [itemid, minutes]);

  if (loading)
    return <Skeleton variant="rectangular" width="100%" height={180} sx={{ borderRadius: 1 }} />;

  if (!data || data.history.length === 0)
    return (
      <Box
        sx={{
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography color="text.secondary" variant="body2">
          No data in this range
        </Typography>
      </Box>
    );

  const labels = data.history.map((p) => formatTimestamp(p.clock));
  const values = data.history.map((p) => p.value);
  const sparsePoints = data.history.length <= 20;

  // Map each alert event to the nearest history sample using true nearest-neighbour
  // (no distance cutoff — any event inside the chart's time range gets shown).
  // If multiple events land on the same sample, keep the most severe one.
  const relevantEvents = alertEvents.filter(
    (e) =>
      e.fired_at >= data.history[0].clock &&
      e.fired_at <= data.history[data.history.length - 1].clock,
  );
  const indexToEvent = new Map<number, import("../app/api").AlertEvent>();
  relevantEvents.forEach((e) => {
    let nearestIdx = 0;
    let nearestDist = Math.abs(e.fired_at - data.history[0].clock);
    for (let i = 1; i < data.history.length; i++) {
      const dist = Math.abs(e.fired_at - data.history[i].clock);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    const existing = indexToEvent.get(nearestIdx);
    if (!existing || e.severity > existing.severity) {
      indexToEvent.set(nearestIdx, e);
    }
  });

  // Marker Y sits on the line (history value) so the dot is always visible.
  // Color is driven by severity so you can tell at a glance how bad it was.
  const alertMarkers: (number | null)[] = data.history.map((p, idx) =>
    indexToEvent.has(idx) ? p.value : null,
  );
  const markerColors = data.history.map((_, idx) => {
    const e = indexToEvent.get(idx);
    if (!e) return "transparent";
    return SEVERITY_CONFIG.find((s) => s.severity === e.severity)?.color ?? "#F44336";
  });
  const hasMarkers = alertMarkers.some((v) => v !== null);

  const chartData = {
    labels,
    datasets: [
      {
        label: data.item_name,
        data: values,
        borderColor: "#1BA7F5",
        backgroundColor: (context: {
          chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } };
        }) => {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return "rgba(27,167,245,0.15)";
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(27,167,245,0.4)");
          g.addColorStop(0.5, "rgba(27,167,245,0.1)");
          g.addColorStop(1, "rgba(27,167,245,0)");
          return g;
        },
        borderWidth: sparsePoints ? 2.5 : 2,
        pointRadius: sparsePoints ? 4 : 0,
        pointBackgroundColor: "#1BA7F5",
        pointBorderColor: "#fff",
        pointBorderWidth: sparsePoints ? 1.5 : 0,
        pointHoverRadius: sparsePoints ? 6 : 5,
        pointHoverBackgroundColor: "#1BA7F5",
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        tension: 0.35,
        fill: true,
        spanGaps: true,
      },
      // Alert event markers — solid circles on the line, coloured by severity
      ...(hasMarkers
        ? [
            {
              label: "Alert fired",
              data: alertMarkers,
              borderColor: "transparent",
              backgroundColor: "transparent",
              pointStyle: "circle" as const,
              pointRadius: alertMarkers.map((v) => (v !== null ? 8 : 0)),
              pointHoverRadius: alertMarkers.map((v) => (v !== null ? 10 : 0)),
              pointBackgroundColor: markerColors,
              pointBorderColor: alertMarkers.map((v) => (v !== null ? "#fff" : "transparent")),
              pointBorderWidth: 2,
              showLine: false,
              fill: false,
              spanGaps: false,
            },
          ]
        : []),
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 } as const,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? "rgba(5,15,30,0.97)" : "rgba(255,255,255,0.97)",
        borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
        borderWidth: 1,
        padding: 12,
        bodyFont: { size: 11 },
        bodyColor: isDark ? "#F1F5F9" : "#1E293B",
        cornerRadius: 6,
        callbacks: {
          title: (items: { dataIndex: number }[]) => {
            const idx = items[0]?.dataIndex;
            if (idx === undefined) return "";
            // Show the exact alert fired_at time when a marker is present at this index
            const event = indexToEvent.get(idx);
            const clock = event ? event.fired_at : data.history[idx]?.clock;
            if (!clock) return "";
            return new Date(clock * 1000).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
          },
          label: (ctx: { datasetIndex: number; dataIndex: number; parsed: { y: number | null } }) => {
            if (ctx.parsed.y == null) return "";
            if (ctx.datasetIndex === 1) {
              const e = indexToEvent.get(ctx.dataIndex);
              if (!e) return "";
              const sevLabel =
                SEVERITY_CONFIG.find((s) => s.severity === e.severity)?.label ?? "Alert";
              return ` ⚠ ${sevLabel}: ${e.actual_value}${data.units && data.units !== "%" ? ` ${data.units}` : ""}`;
            }
            return ` ${ctx.parsed.y}${data.units && data.units !== "%" ? ` ${data.units}` : ""}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 5,
          color: tickColor,
          font: { size: 10 },
          maxRotation: 0,
          minRotation: 0,
        },
        grid: { color: gridColor, drawTicks: false },
        border: { display: false },
      },
      y: {
        ticks: { color: tickColor, font: { size: 10 }, padding: 6, maxTicksLimit: 5 },
        grid: { color: gridColor, drawTicks: false },
        border: { display: false },
      },
    },
  };

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 180,
        bgcolor: chartBg,
        borderRadius: 1.5,
        p: "14px 10px 8px 10px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Live indicator */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: refreshing ? "#FFC107" : "#22C55E",
          zIndex: 1,
          transition: "background-color 0.3s",
          ...(refreshing && {
            animation: "livePulse 0.8s ease-in-out infinite",
            "@keyframes livePulse": {
              "0%": { opacity: 1 },
              "50%": { opacity: 0.3 },
              "100%": { opacity: 1 },
            },
          }),
        }}
      />
      <Line data={chartData} options={chartOptions} plugins={[metricsGlowPlugin]} />
    </Box>
  );
};

// ── Add metric dialog ─────────────────────────────────────────────────

const AddMetricDialog = ({
  open,
  onClose,
  onAdd,
  existingIds,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (hostname: string, item: ItemDef) => void;
  existingIds: string[];
}) => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState("");
  const [items, setItems] = useState<ItemDef[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    api.listHosts().then((res) => setHosts(res.hosts));
    setSelectedHost("");
    setItems([]);
    setItemSearch("");
  }, [open]);

  useEffect(() => {
    if (!selectedHost) return;
    setItemsLoading(true);
    setItems([]);
    setItemSearch("");
    api
      .listItems(selectedHost)
      .then((res) => {
        const numeric = res.items.filter((i) => i.value_type === "0" || i.value_type === "3");
        setItems(numeric);
      })
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [selectedHost]);

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      i.key_.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography fontWeight={700}>Add Metric Widget</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ p: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Host</InputLabel>
            <Select
              label="Host"
              value={selectedHost}
              onChange={(e) => setSelectedHost(e.target.value)}
            >
              {hosts.map((h) => (
                <MenuItem key={h.hostid} value={h.host}>
                  {h.host}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Divider />
        {!selectedHost ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography color="text.secondary" variant="body2">
              Select a host to see its items
            </Typography>
          </Box>
        ) : itemsLoading ? (
          <Box sx={{ p: 2 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              <Skeleton key={i} variant="text" height={48} sx={{ mb: 0.5 }} />
            ))}
          </Box>
        ) : (
          <>
            <Box sx={{ p: 2, pb: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search items…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <ShowChartOutlinedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Divider />
            {filteredItems.length === 0 ? (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography color="text.secondary" variant="body2">
                  {itemSearch ? "No items match your search" : "No numeric items on this host"}
                </Typography>
              </Box>
            ) : (
              <List dense sx={{ maxHeight: 360, overflowY: "auto" }}>
                {filteredItems.map((item) => {
                  const added = existingIds.includes(item.itemid);
                  return (
                    <ListItem key={item.itemid} sx={{ opacity: added ? 0.45 : 1 }}>
                      <ListItemText
                        primary={item.name}
                        secondary={item.key_}
                        primaryTypographyProps={{ fontSize: "0.82rem", fontWeight: 500 }}
                        secondaryTypographyProps={{ fontSize: "0.72rem", fontFamily: "monospace" }}
                      />
                      <ListItemSecondaryAction>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={added}
                          onClick={() => {
                            onAdd(selectedHost, item);
                            onClose();
                          }}
                          sx={{ fontSize: "0.72rem", minWidth: 60 }}
                        >
                          {added ? "Added" : "Add"}
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Metric widget card ────────────────────────────────────────────────

const MetricWidgetCard = ({
  widget,
  onRemove,
  onUpdate,
  alertEvents = [],
}: {
  widget: MetricWidgetConfig;
  onRemove: () => void;
  onUpdate: (updates: Partial<MetricWidgetConfig>) => void;
  alertEvents?: import("../app/api").AlertEvent[];
}) => {
  const periodOption = PERIOD_OPTIONS[widget.periodIdx] ?? PERIOD_OPTIONS[5];

  return (
    <Paper
      elevation={2}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          bgcolor: "action.hover",
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          px: 0.5,
        }}
      >
        {/* Draggable area */}
        <Box
          className="drag-handle"
          role="button"
          aria-label="Drag to reposition widget"
          tabIndex={0}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flex: 1,
            minWidth: 0,
            px: 1,
            py: 0.6,
            cursor: "grab",
            "&:active": { cursor: "grabbing" },
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 13, color: "text.disabled", flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0, ml: 0.25 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: "0.76rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={widget.itemName}
            >
              {widget.itemName}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontSize: "0.65rem", color: "text.secondary", display: "block", lineHeight: 1 }}
            >
              {widget.hostname}
            </Typography>
          </Box>
        </Box>

        {/* Controls — outside drag zone */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0, pr: 0.5 }}>
          <Select
            variant="standard"
            value={widget.periodIdx}
            onChange={(e) => onUpdate({ periodIdx: Number(e.target.value) })}
            sx={{
              fontSize: "0.68rem",
              color: "text.secondary",
              "&:before, &:after": { display: "none" },
              "& .MuiSelect-select": { py: 0, pr: "18px !important", pl: 0.5 },
              "& .MuiSvgIcon-root": { fontSize: 14, right: 0 },
            }}
          >
            {PERIOD_OPTIONS.map((opt, i) => (
              <MenuItem key={opt.label} value={i} sx={{ fontSize: "0.72rem" }}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
          <IconButton
            size="small"
            aria-label="Remove widget"
            onClick={onRemove}
            sx={{
              color: "text.disabled",
              "&:hover": { color: "error.light" },
              p: 0.3,
            }}
          >
            <CloseIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, p: 1, overflow: "hidden" }}>
        <ItemChart
          itemid={widget.itemid}
          minutes={periodOption.minutes}
          alertEvents={alertEvents}
        />
      </Box>
    </Paper>
  );
};

// ── Problems tab ──────────────────────────────────────────────────────

const ProblemsTab = () => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverities, setSelectedSeverities] = useState<number[]>([]);
  const [hostFilter, setHostFilter] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set());

  const loadProblems = useCallback(() => {
    setLoading(true);
    Promise.all([api.getProblems(), api.listHosts()])
      .then(([pr, hr]) => {
        setProblems(pr.problems);
        setHosts(hr.hosts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAcknowledge = useCallback(async (eventid: string) => {
    setAcknowledging((prev) => new Set([...prev, eventid]));
    try {
      await api.acknowledgeProblem(eventid);
      setProblems((prev) =>
        prev.map((p) => (p.eventid === eventid ? { ...p, acknowledged: true } : p)),
      );
    } catch {
      // no-op — button re-enables so user can retry
    } finally {
      setAcknowledging((prev) => {
        const next = new Set(prev);
        next.delete(eventid);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    loadProblems();
    const timer = setInterval(loadProblems, 30_000);
    return () => clearInterval(timer);
  }, [loadProblems]);

  const toggleSeverity = (sev: number) => {
    setSelectedSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev],
    );
  };

  const filtered = problems.filter((p) => {
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(p.severity)) return false;
    if (hostFilter && p.hostname !== hostFilter) return false;
    return true;
  });

  const severityCounts = SEVERITY_CONFIG.map((s) => ({
    ...s,
    count: problems.filter((p) => p.severity === s.severity).length,
  }));

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
          Active Problems
        </Typography>
        {!loading && (
          <Chip
            label={
              filtered.length !== problems.length
                ? `${filtered.length} / ${problems.length}`
                : problems.length
            }
            size="small"
            sx={{ height: 18, fontSize: "0.68rem" }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel sx={{ fontSize: "0.78rem" }}>Filter by host</InputLabel>
          <Select
            label="Filter by host"
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            sx={{ fontSize: "0.78rem" }}
          >
            <MenuItem value="" sx={{ fontSize: "0.78rem" }}>
              All hosts
            </MenuItem>
            {hosts.map((h) => (
              <MenuItem key={h.hostid} value={h.host} sx={{ fontSize: "0.78rem" }}>
                {h.host}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={loadProblems} disabled={loading}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Severity filter chips */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
        {loading
          ? SEVERITY_CONFIG.map((s) => (
              <Skeleton key={s.severity} variant="rounded" width={90} height={26} />
            ))
          : severityCounts
              .filter((s) => s.count > 0)
              .map((s) => {
                const active = selectedSeverities.includes(s.severity);
                return (
                  <Chip
                    key={s.severity}
                    label={`${s.label} (${s.count})`}
                    size="small"
                    onClick={() => toggleSeverity(s.severity)}
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      color: active ? s.color : "text.secondary",
                      backgroundColor: active ? s.bg : "transparent",
                      border: `1px solid ${active ? `${s.color}80` : "rgba(255,255,255,0.1)"}`,
                      transition: "all 0.15s",
                    }}
                  />
                );
              })}
        {!loading && problems.length === 0 && (
          <Chip
            label="No active problems"
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontSize: "0.72rem" }}
          />
        )}
        {!loading && selectedSeverities.length > 0 && (
          <Chip
            label="Clear filters"
            size="small"
            variant="outlined"
            onDelete={() => setSelectedSeverities([])}
            sx={{ fontSize: "0.72rem" }}
          />
        )}
      </Box>

      {/* Problems table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 130 }}>
                Severity
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 160 }}>Host</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Problem</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 90 }}>
                Duration
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 90 }}>Ack</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                    <TableCell key={j}>
                      <Skeleton variant="text" height={20} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  {problems.length === 0 ? "No active problems" : "No problems match filters"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.eventid} sx={{ "&:hover": { backgroundColor: "action.hover" } }}>
                  <TableCell>
                    <SeverityChip severity={p.severity} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: "0.8rem", fontWeight: 500 }}>
                      {p.hostname}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                      {p.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: "0.75rem", color: "text.secondary" }}
                    >
                      {formatAge(p.age_seconds)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {p.acknowledged ? (
                      <Chip
                        label="Ack'd"
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.68rem" }}
                      />
                    ) : (
                      <Tooltip title="Acknowledge this problem in Zabbix">
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleAcknowledge(p.eventid)}
                            disabled={acknowledging.has(p.eventid)}
                            sx={{ fontSize: "0.68rem", height: 20, minWidth: 50, px: 1 }}
                          >
                            {acknowledging.has(p.eventid) ? "…" : "Ack"}
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

// ── Item History tab (widget grid) ────────────────────────────────────

const ItemHistoryTab = () => {
  const [widgets, setWidgets] = useState<MetricWidgetConfig[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveScope, setSaveScope] = useState<"user" | "team">("user");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Alert events fetched once — used to draw breach markers on each chart
  const [allAlertEvents, setAllAlertEvents] = useState<import("../app/api").AlertEvent[]>([]);

  useEffect(() => {
    const fetchEvents = () => {
      api
        .getAlertEvents(500)
        .then((r) => setAllAlertEvents(r.events))
        .catch(() => {});
    };
    fetchEvents();
    const timer = setInterval(fetchEvents, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api
      .getMetricLayout("user")
      .then((res) => {
        const userWidgets = res.widgets ?? [];
        if (userWidgets.length > 0) {
          setWidgets(userWidgets);
          setSaveScope("user");
          return;
        }
        // No personal layout — fall back to team layout
        return api.getMetricLayout("team").then((teamRes) => {
          const teamWidgets = teamRes.widgets ?? [];
          setWidgets(teamWidgets);
          setSaveScope(teamWidgets.length > 0 ? "team" : "user");
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleLayoutChange = useCallback(
    (layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      setWidgets((prev) => {
        const next = prev.map((w) => {
          const l = layout.find((item) => item.i === w.i);
          return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
        });
        const moved = next.some((w, i) => {
          const o = prev[i];
          return o && (w.x !== o.x || w.y !== o.y || w.w !== o.w || w.h !== o.h);
        });
        if (moved) setIsDirty(true);
        return next;
      });
    },
    [],
  );

  const addWidget = useCallback((hostname: string, item: ItemDef) => {
    setWidgets((prev) => {
      const col = prev.length % 2 === 0 ? 0 : 6;
      const row = Math.floor(prev.length / 2) * 4;
      const widget: MetricWidgetConfig = {
        i: `${item.itemid}-${Date.now()}`,
        hostname,
        itemid: item.itemid,
        itemName: item.name,
        units: "",
        periodIdx: 5,
        x: col,
        y: row,
        w: 6,
        h: 4,
      };
      return [...prev, widget];
    });
    setIsDirty(true);
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.i !== id));
    setIsDirty(true);
  }, []);

  const updateWidget = useCallback((id: string, updates: Partial<MetricWidgetConfig>) => {
    setWidgets((prev) => prev.map((w) => (w.i === id ? { ...w, ...updates } : w)));
    setIsDirty(true);
  }, []);

  const saveLayout = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveMetricLayout(saveScope, widgets);
      setIsDirty(false);
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false);
    }
  }, [saveScope, widgets]);

  const layout = widgets.map((w) => ({
    i: w.i,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    minW: 4,
    minH: 3,
  }));

  const existingIds = widgets.map((w) => w.itemid);

  if (!loaded) {
    return (
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          <Skeleton key={i} variant="rectangular" height={320} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
          Item History
        </Typography>
        {widgets.length > 0 && (
          <Chip
            label={widgets.length}
            size="small"
            sx={{ height: 18, fontSize: "0.68rem", minWidth: 24 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Add metric">
          <IconButton size="small" color="primary" onClick={() => setAddOpen(true)}>
            <AddIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Select
          size="small"
          value={saveScope}
          onChange={(e) => {
            const newScope = e.target.value as "user" | "team";
            if (
              isDirty &&
              !window.confirm("You have unsaved changes. Switch layout and discard them?")
            )
              return;
            setSaveScope(newScope);
            api
              .getMetricLayout(newScope)
              .then((res) => {
                setWidgets(res.widgets ?? []);
                setIsDirty(false);
              })
              .catch(() => {});
          }}
          sx={{
            fontSize: "0.72rem",
            height: 28,
            "& .MuiSelect-select": { py: 0, px: 1, lineHeight: "28px" },
          }}
        >
          <MenuItem value="user" sx={{ fontSize: "0.78rem" }}>
            Mine
          </MenuItem>
          <MenuItem value="team" sx={{ fontSize: "0.78rem" }}>
            Team
          </MenuItem>
        </Select>
        <Tooltip title={saving ? "Saving…" : isDirty ? "Save layout" : "Layout saved"}>
          <span>
            <IconButton
              size="small"
              color={isDirty ? "warning" : "default"}
              onClick={saveLayout}
              disabled={!isDirty || saving}
            >
              <SaveIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Empty state */}
      {widgets.length === 0 ? (
        <Box
          sx={{
            py: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <ShowChartOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography color="text.secondary" variant="body2">
            No metric widgets added yet
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add your first metric
          </Button>
        </Box>
      ) : (
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={80}
          draggableHandle=".drag-handle"
          onLayoutChange={handleLayoutChange}
          style={{ minHeight: 200 }}
        >
          {widgets.map((w) => (
            <div key={w.i}>
              <MetricWidgetCard
                widget={w}
                onRemove={() => removeWidget(w.i)}
                onUpdate={(updates) => updateWidget(w.i, updates)}
                alertEvents={allAlertEvents.filter((e) => e.item_id === w.itemid)}
              />
            </div>
          ))}
        </GridLayout>
      )}

      <AddMetricDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addWidget}
        existingIds={existingIds}
      />
    </Box>
  );
};

// ── Main export ───────────────────────────────────────────────────────

// ── Severity labels (reuse same palette as problems) ─────────────────

const SEV_LABELS: Record<number, { label: string; color: string }> = {
  5: { label: "Critical", color: "#B71C1C" },
  4: { label: "High", color: "#F44336" },
  3: { label: "Medium", color: "#FF5722" },
  2: { label: "Low", color: "#FFC107" },
  1: { label: "Info", color: "#2196F3" },
  0: { label: "None", color: "#9E9E9E" },
};

type ItemDef2 = { itemid: string; name: string; key_: string };

// ── Alert Rules tab ───────────────────────────────────────────────────

const AlertRulesTab = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  // Add dialog state
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState("");
  const [items, setItems] = useState<ItemDef2[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState("");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("");
  const [severity, setSeverity] = useState(2);
  const [creating, setCreating] = useState(false);

  const loadRules = useCallback(() => {
    setLoading(true);
    api
      .listAlertRules()
      .then((r) => setRules(r.rules))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Reset dialog state when opened
  useEffect(() => {
    if (!addOpen) return;
    setSelectedHost("");
    setSelectedItemIds(new Set());
    setItems([]);
    setItemSearch("");
    setOperator(">");
    setThreshold("");
    setSeverity(2);
    api.listHosts().then((r) => setHosts(r.hosts));
  }, [addOpen]);

  // Load numeric items when host is selected
  useEffect(() => {
    if (!selectedHost) {
      setItems([]);
      setSelectedItemIds(new Set());
      return;
    }
    setItemsLoading(true);
    api
      .listItems(selectedHost, true)
      .then((r) => {
        setItems(
          r.items.filter(
            (i: { value_type: string }) => i.value_type === "0" || i.value_type === "3",
          ),
        );
        setSelectedItemIds(new Set());
      })
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [selectedHost]);

  const toggleItem = (itemid: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      next.has(itemid) ? next.delete(itemid) : next.add(itemid);
      return next;
    });
  };

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      i.key_.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  const handleAdd = async () => {
    if (selectedItemIds.size === 0 || !threshold || !selectedHost) return;
    setCreating(true);
    try {
      await Promise.all(
        items
          .filter((i) => selectedItemIds.has(i.itemid))
          .map((i) =>
            api.createAlertRule({
              item_id: i.itemid,
              item_name: i.name,
              hostname: selectedHost,
              operator,
              threshold: parseFloat(threshold),
              severity,
            }),
          ),
      );
      setAddOpen(false);
      loadRules();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteAlertRule(id);
    loadRules();
  };

  const handleToggle = async (id: number) => {
    await api.toggleAlertRule(id);
    loadRules();
  };

  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <NotificationsActiveOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
          Alert Rules
        </Typography>
        {!loading && rules.length > 0 && (
          <Chip label={rules.length} size="small" sx={{ height: 18, fontSize: "0.68rem" }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
        >
          Add rule
        </Button>
      </Box>

      {/* Rules table */}
      {loading ? (
        <Box>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="text" height={48} sx={{ mb: 0.5 }} />
          ))}
        </Box>
      ) : rules.length === 0 ? (
        <Box
          sx={{
            py: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.5,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <NotificationsActiveOutlinedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          <Typography color="text.secondary" variant="body2">
            No alert rules yet
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add your first rule
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 80 }}>
                  Condition
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 100 }}>
                  Severity
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 80 }}>
                  Status
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 70 }}>
                  Active
                </TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((r) => {
                const sev = SEV_LABELS[r.severity] ?? SEV_LABELS[0];
                return (
                  <TableRow
                    key={r.id}
                    sx={{ opacity: r.enabled ? 1 : 0.5, "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: "0.8rem", fontWeight: 500 }}>
                        {r.item_name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: "0.7rem" }}
                      >
                        {r.hostname}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: "0.8rem", fontFamily: "monospace" }}
                      >
                        {r.operator} {r.threshold}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={sev.label}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: sev.color,
                          bgcolor: `${sev.color}18`,
                          border: `1px solid ${sev.color}40`,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {r.is_firing ? (
                        <Chip
                          label="Firing"
                          size="small"
                          color="error"
                          sx={{ height: 20, fontSize: "0.68rem" }}
                        />
                      ) : (
                        <Chip
                          label="OK"
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.68rem" }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="small"
                        checked={r.enabled}
                        onChange={() => handleToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Delete rule">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(r.id)}
                          sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add rule dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography fontWeight={700}>New Alert Rules</Typography>
          <IconButton size="small" onClick={() => setAddOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}>
            {/* Host */}
            <FormControl size="small" fullWidth>
              <InputLabel>Host</InputLabel>
              <Select
                label="Host"
                value={selectedHost}
                onChange={(e) => setSelectedHost(e.target.value)}
              >
                {hosts.map((h) => (
                  <MenuItem key={h.hostid} value={h.host}>
                    {h.host}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Operator + threshold */}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <FormControl size="small" sx={{ width: 110 }}>
                <InputLabel>Operator</InputLabel>
                <Select
                  label="Operator"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                >
                  {([">", ">=", "<", "<="] as const).map((op) => (
                    <MenuItem key={op} value={op} sx={{ fontFamily: "monospace" }}>
                      {op}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Threshold"
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                sx={{ flex: 1 }}
                placeholder="e.g. 90"
              />
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Severity</InputLabel>
                <Select
                  label="Severity"
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                >
                  {Object.entries(SEV_LABELS)
                    .sort((a, b) => Number(b[0]) - Number(a[0]))
                    .map(([k, v]) => (
                      <MenuItem key={k} value={Number(k)}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box
                            sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: v.color }}
                          />
                          {v.label}
                        </Box>
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Box>
          </Box>

          <Divider />

          {/* Item checklist */}
          {selectedHost && (
            <>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {itemsLoading
                      ? "Loading items…"
                      : `${filteredItems.length} items — ${selectedItemIds.size} selected`}
                  </Typography>
                  {selectedItemIds.size > 0 && (
                    <Typography
                      variant="caption"
                      sx={{ color: "primary.main", cursor: "pointer", fontSize: "0.72rem" }}
                      onClick={() => setSelectedItemIds(new Set())}
                    >
                      Clear selection
                    </Typography>
                  )}
                </Box>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search items…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  disabled={itemsLoading}
                />
              </Box>
              <List dense disablePadding sx={{ maxHeight: 280, overflowY: "auto", pb: 1 }}>
                {itemsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                    <Box key={i} sx={{ px: 2, py: 0.5 }}>
                      <Skeleton variant="text" height={36} />
                    </Box>
                  ))
                ) : filteredItems.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: "center" }}>
                    <Typography variant="caption" color="text.disabled">
                      No numeric items found
                    </Typography>
                  </Box>
                ) : (
                  filteredItems.map((item) => {
                    const checked = selectedItemIds.has(item.itemid);
                    return (
                      <ListItem
                        key={item.itemid}
                        onClick={() => toggleItem(item.itemid)}
                        sx={{
                          cursor: "pointer",
                          px: 2,
                          bgcolor: checked ? "rgba(59,130,246,0.07)" : "transparent",
                          "&:hover": { bgcolor: checked ? "rgba(59,130,246,0.1)" : "action.hover" },
                        }}
                      >
                        <Checkbox
                          edge="start"
                          size="small"
                          checked={checked}
                          disableRipple
                          onChange={() => toggleItem(item.itemid)}
                          sx={{ p: 0, mr: 1.5 }}
                        />
                        <ListItemText
                          primary={item.name}
                          secondary={item.key_}
                          primaryTypographyProps={{
                            fontSize: "0.82rem",
                            fontWeight: checked ? 600 : 400,
                          }}
                          secondaryTypographyProps={{ fontSize: "0.7rem", fontFamily: "monospace" }}
                        />
                      </ListItem>
                    );
                  })
                )}
              </List>
            </>
          )}

          {!selectedHost && (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography variant="caption" color="text.disabled">
                Select a host to see its items
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={
              selectedItemIds.size === 0 || !threshold || isNaN(parseFloat(threshold)) || creating
            }
          >
            {creating
              ? "Creating…"
              : selectedItemIds.size > 1
                ? `Create ${selectedItemIds.size} rules`
                : "Create rule"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ── Notifications tab ─────────────────────────────────────────────────

const NotificationsTab = () => {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverities, setSelectedSeverities] = useState<number[]>([]);
  const [hostFilter, setHostFilter] = useState("");

  const loadEvents = useCallback(() => {
    setLoading(true);
    api
      .getAlertEvents(500)
      .then((r) => setEvents(r.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadEvents();
    const timer = setInterval(loadEvents, 30_000);
    return () => clearInterval(timer);
  }, [loadEvents]);

  const toggleSeverity = (sev: number) => {
    setSelectedSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev],
    );
  };

  const uniqueHosts = Array.from(new Set(events.map((e) => e.hostname))).sort();

  const filtered = events.filter((e) => {
    if (selectedSeverities.length > 0 && !selectedSeverities.includes(e.severity)) return false;
    if (hostFilter && e.hostname !== hostFilter) return false;
    return true;
  });

  const severityCounts = SEVERITY_CONFIG.map((s) => ({
    ...s,
    count: events.filter((e) => e.severity === s.severity).length,
  }));

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <NotificationsActiveOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
          Alert Notifications
        </Typography>
        {!loading && (
          <Chip
            label={
              filtered.length !== events.length
                ? `${filtered.length} / ${events.length}`
                : events.length
            }
            size="small"
            sx={{ height: 18, fontSize: "0.68rem" }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel sx={{ fontSize: "0.78rem" }}>Filter by host</InputLabel>
          <Select
            label="Filter by host"
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            sx={{ fontSize: "0.78rem" }}
          >
            <MenuItem value="" sx={{ fontSize: "0.78rem" }}>
              All hosts
            </MenuItem>
            {uniqueHosts.map((h) => (
              <MenuItem key={h} value={h} sx={{ fontSize: "0.78rem" }}>
                {h}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={loadEvents} disabled={loading}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Severity filter chips */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
        {loading
          ? SEVERITY_CONFIG.map((s) => (
              <Skeleton key={s.severity} variant="rounded" width={90} height={26} />
            ))
          : severityCounts
              .filter((s) => s.count > 0)
              .map((s) => {
                const active = selectedSeverities.includes(s.severity);
                return (
                  <Chip
                    key={s.severity}
                    label={`${s.label} (${s.count})`}
                    size="small"
                    onClick={() => toggleSeverity(s.severity)}
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      color: active ? s.color : "text.secondary",
                      backgroundColor: active ? s.bg : "transparent",
                      border: `1px solid ${active ? `${s.color}80` : "rgba(255,255,255,0.1)"}`,
                      transition: "all 0.15s",
                    }}
                  />
                );
              })}
        {!loading && events.length === 0 && (
          <Chip
            label="No notifications yet"
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontSize: "0.72rem" }}
          />
        )}
        {!loading && selectedSeverities.length > 0 && (
          <Chip
            label="Clear filters"
            size="small"
            variant="outlined"
            onDelete={() => setSelectedSeverities([])}
            sx={{ fontSize: "0.72rem" }}
          />
        )}
      </Box>

      {/* Notifications table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 130 }}>
                Severity
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 160 }}>Host</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Item</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 110 }}>
                Condition
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 100 }}>
                Value
              </TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 100 }}>
                Fired
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                    <TableCell key={j}>
                      <Skeleton variant="text" height={20} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  {events.length === 0
                    ? "No alert notifications yet"
                    : "No notifications match filters"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => {
                const sev = SEVERITY_CONFIG.find((s) => s.severity === e.severity) ??
                  SEVERITY_CONFIG[5];
                const ageSeconds = Math.floor(Date.now() / 1000) - e.fired_at;
                return (
                  <TableRow
                    key={e.id}
                    sx={{ "&:hover": { backgroundColor: "action.hover" } }}
                  >
                    <TableCell>
                      <SeverityChip severity={e.severity} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: "0.8rem", fontWeight: 500 }}>
                        {e.hostname}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                        {e.item_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: "0.8rem", fontFamily: "monospace" }}
                      >
                        {e.operator} {e.threshold}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: "0.8rem", fontWeight: 600, color: sev.color }}
                      >
                        {e.actual_value}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={new Date(e.fired_at * 1000).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontSize: "0.75rem", color: "text.secondary", cursor: "default" }}
                        >
                          {formatAge(ageSeconds)} ago
                        </Typography>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

// ── Main export ───────────────────────────────────────────────────────

export const Metrics = () => {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <ShowChartOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
            Metrics
          </Typography>
        </Box>
        <Typography color="text.secondary" sx={{ fontSize: "0.875rem" }}>
          Active problems, alert notifications, item history charts, and custom alert rules
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Problems" sx={{ fontSize: "0.82rem", textTransform: "none", minHeight: 40 }} />
        <Tab
          label="Notifications"
          sx={{ fontSize: "0.82rem", textTransform: "none", minHeight: 40 }}
        />
        <Tab
          label="Item History"
          sx={{ fontSize: "0.82rem", textTransform: "none", minHeight: 40 }}
        />
        <Tab
          label="Alert Rules"
          sx={{ fontSize: "0.82rem", textTransform: "none", minHeight: 40 }}
        />
      </Tabs>

      {tab === 0 && <ProblemsTab />}
      {tab === 1 && <NotificationsTab />}
      {tab === 2 && <ItemHistoryTab />}
      {tab === 3 && <AlertRulesTab />}
    </Box>
  );
};
