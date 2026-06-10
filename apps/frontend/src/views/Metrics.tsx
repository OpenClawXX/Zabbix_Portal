"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
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
import ZoomPlugin from "chartjs-plugin-zoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../app/context/AuthContext";
import {
  type CustomSound,
  isCustomId,
  listSounds,
  playSoundById,
} from "../lib/soundLibrary";
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
  ZoomPlugin,
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

const PRESET_COLORS = [
  "#1BA7F5", "#00BFB3", "#F77B00", "#9170B8",
  "#E7664C", "#22C55E", "#F44336", "#FFC107",
  "#8B5CF6", "#D36086", "#54B399", "#D6BF57",
];

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

const formatRangeBound = (clock: number, spanMinutes: number): string => {
  const d = new Date(clock * 1000);
  if (spanMinutes >= 1440) {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const formatTimestamp = (clock: number, minutes?: number): string => {
  const d = new Date(clock * 1000);
  if (minutes !== undefined && minutes <= 5) {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  if (minutes !== undefined && minutes >= 1440) {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
};

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
  lineColor = "#1BA7F5",
  onPeriodChange,
}: {
  itemid: string;
  minutes: number;
  alertEvents?: import("../app/api").AlertEvent[];
  lineColor?: string;
  onPeriodChange?: (delta: number) => void;
}) => {
  const { palette } = useTheme();
  const isDark = palette.mode === "dark";
  const chartBg = isDark ? "#0D1B2A" : "#F1F5F9";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  // Light mode needs a clearly dark tick so the time axis doesn't blend into the
  // pale chart background; dark mode needs a light-enough slate for contrast.
  const tickColor = isDark ? "#94A3B8" : "#334155";

  // biome-ignore lint/suspicious/noExplicitAny: chartjs-plugin-zoom resetZoom ref
  const chartRef = useRef<any>(null);

  const prevItemIdRef = useRef<string>("");
  const [data, setData] = useState<ItemHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Only show the full skeleton when the item itself changes (different metric).
    // A period/minutes change keeps the existing chart and refreshes in the background.
    const isNewItem = prevItemIdRef.current !== itemid;
    prevItemIdRef.current = itemid;

    if (isNewItem) {
      setLoading(true);
      setData(null);
      setRefreshing(false);
    } else {
      setRefreshing(true);
    }

    api
      .getItemHistory(itemid, minutes)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
          setRefreshing(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (isNewItem) { setData(null); setLoading(false); }
          else setRefreshing(false);
        }
      });

    const timer = setInterval(() => {
      setRefreshing(true);
      api
        .getItemHistory(itemid, minutes)
        .then((res) => { if (!cancelled) { setData(res); setRefreshing(false); } })
        .catch(() => { if (!cancelled) setRefreshing(false); });
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [itemid, minutes]);

  // Reset visual zoom whenever the period selector changes (component stays alive, no remount)
  useEffect(() => { chartRef.current?.resetZoom(); }, [minutes]);

  if (loading)
    return <Skeleton variant="rectangular" width="100%" height={180} sx={{ borderRadius: 1 }} />;

  const noRecordings = !data || data.history.length === 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const rangeFrom = nowSec - minutes * 60;

  if (noRecordings) {
    const currentIdx = PERIOD_OPTIONS.findIndex((o) => o.minutes === minutes);
    const largerOptions = currentIdx >= 0 ? PERIOD_OPTIONS.slice(currentIdx + 1) : [];
    return (
      <Box
        sx={{
          height: "100%",
          minHeight: 180,
          bgcolor: chartBg,
          borderRadius: 1.5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          p: 3,
          position: "relative",
        }}
      >
        <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, color: "text.secondary" }}>
          No data in the last {PERIOD_OPTIONS[currentIdx]?.label ?? `${minutes} min`}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.disabled", textAlign: "center", maxWidth: 260 }}>
          This metric has no recordings in this window. Try a wider range to find when data was last collected.
        </Typography>
        {largerOptions.length > 0 && onPeriodChange && (
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", justifyContent: "center", mt: 0.5 }}>
            {largerOptions.map((opt, i) => (
              <Chip
                key={opt.label}
                label={opt.label}
                size="small"
                clickable
                variant="outlined"
                color="primary"
                onClick={() => onPeriodChange(i + 1)}
                sx={{ fontSize: "0.72rem" }}
              />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  const historyPoints = data.history;

  const sparsePoints = !noRecordings && data.history.length <= 20;

  // Map each alert event to its nearest real data point (clock-keyed so we
  // stay accurate after padding / format changes).  Keep the most severe event
  // per clock position.
  type EventItem = { firedAt: number; y: number; color: string; sevLabel: string; actualValue: number; severity: number };
  const eventItems: EventItem[] = [];
  if (!noRecordings) {
    const clockMap = new Map<number, EventItem>();
    for (const e of alertEvents) {
      if (e.fired_at < rangeFrom || e.fired_at > nowSec) continue;
      const nearest = data.history.reduce((best, p) =>
        Math.abs(p.clock - e.fired_at) < Math.abs(best.clock - e.fired_at) ? p : best,
      );
      const existing = clockMap.get(nearest.clock);
      if (!existing || e.severity > existing.severity) {
        clockMap.set(nearest.clock, {
          firedAt: e.fired_at,
          y: nearest.value,
          color: SEVERITY_CONFIG.find((s) => s.severity === e.severity)?.color ?? "#F44336",
          sevLabel: SEVERITY_CONFIG.find((s) => s.severity === e.severity)?.label ?? "Alert",
          actualValue: e.actual_value,
          severity: e.severity,
        });
      }
    }
    eventItems.push(...clockMap.values());
  }

  const chartData = {
    datasets: [
      {
        label: data?.item_name ?? "",
        data: historyPoints.map((p) => ({ x: p.clock, y: p.value })),
        borderColor: lineColor,
        backgroundColor: (context: {
          chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } };
        }) => {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return `${lineColor}26`;
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, `${lineColor}66`);
          g.addColorStop(0.5, `${lineColor}1A`);
          g.addColorStop(1, `${lineColor}00`);
          return g;
        },
        borderWidth: sparsePoints ? 2.5 : 2,
        pointRadius: sparsePoints ? 4 : 0,
        pointBackgroundColor: lineColor,
        pointBorderColor: "#fff",
        pointBorderWidth: sparsePoints ? 1.5 : 0,
        pointHoverRadius: sparsePoints ? 6 : 5,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        tension: 0.35,
        fill: true,
        spanGaps: true,
      },
      ...(eventItems.length > 0
        ? [
            {
              label: "Alert fired",
              data: eventItems.map((e) => ({ x: e.firedAt, y: e.y })),
              borderColor: "transparent",
              backgroundColor: "transparent",
              pointStyle: "circle" as const,
              pointRadius: 8,
              pointHoverRadius: 10,
              pointBackgroundColor: eventItems.map((e) => e.color),
              pointBorderColor: "#fff",
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
    interaction: { mode: "nearest" as const, intersect: false, axis: "x" as const },
    plugins: {
      legend: { display: false },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: "x" as const,
          onZoomComplete: ({ chart }: { chart: any }) => {
            if (!onPeriodChange) return;
            const xScale = chart.scales.x;
            const visibleMinutes = (xScale.max - xScale.min) / 60;
            const currentIdx = PERIOD_OPTIONS.findIndex((o) => o.minutes === minutes);
            let closestIdx = 0;
            let closestDiff = Number.POSITIVE_INFINITY;
            PERIOD_OPTIONS.forEach((opt, i) => {
              const diff = Math.abs(opt.minutes - visibleMinutes);
              if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
            });
            if (currentIdx !== -1 && closestIdx !== currentIdx) {
              onPeriodChange(closestIdx - currentIdx);
            }
          },
        },
        pan: { enabled: true, mode: "x" as const },
      },
      tooltip: {
        backgroundColor: isDark ? "rgba(5,15,30,0.97)" : "rgba(255,255,255,0.97)",
        borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
        borderWidth: 1,
        padding: 12,
        bodyFont: { size: 11 },
        bodyColor: isDark ? "#F1F5F9" : "#1E293B",
        cornerRadius: 6,
        callbacks: {
          title: (items: { raw: unknown }[]) => {
            const raw = items[0]?.raw as { x: number } | undefined;
            if (!raw) return "";
            return new Date(raw.x * 1000).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
          },
          label: (ctx: { datasetIndex: number; raw: unknown; parsed: { y: number | null } }) => {
            if (ctx.parsed.y == null) return "";
            if (ctx.datasetIndex === 1) {
              const raw = ctx.raw as { x: number };
              const item = eventItems.find((e) => e.firedAt === raw.x);
              if (!item) return "";
              return ` ⚠ ${item.sevLabel}: ${item.actualValue}${data?.units && data.units !== "%" ? ` ${data.units}` : ""}`;
            }
            return ` ${ctx.parsed.y}${data?.units && data.units !== "%" ? ` ${data.units}` : ""}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "linear" as const,
        min: rangeFrom,
        max: nowSec,
        ticks: {
          maxTicksLimit: 5,
          color: tickColor,
          font: { size: 10 },
          maxRotation: 0,
          minRotation: 0,
          callback: (value: string | number) => formatTimestamp(Number(value), minutes),
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
        // Dim slightly while a background refresh is in flight
        opacity: refreshing ? 0.72 : 1,
        transition: "opacity 0.2s ease",
        borderRadius: 1.5,
        p: "14px 10px 8px 10px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Time range label — always visible so the user can confirm the filter changed */}
      <Typography
        variant="caption"
        sx={{
          position: "absolute",
          top: 7,
          left: 10,
          fontSize: "0.58rem",
          color: tickColor,
          opacity: 0.65,
          zIndex: 1,
          letterSpacing: 0,
          userSelect: "none",
        }}
      >
        {formatRangeBound(rangeFrom, minutes)}
        {" → "}
        {formatRangeBound(nowSec, minutes)}
      </Typography>
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
      <Line
        ref={chartRef}
        data={chartData}
        options={chartOptions}
        plugins={[metricsGlowPlugin]}
        onDoubleClick={() => chartRef.current?.resetZoom()}
      />
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

// ── Metric config dialog ──────────────────────────────────────────────

const MetricConfigDialog = ({
  open,
  widget,
  onClose,
  onSave,
}: {
  open: boolean;
  widget: MetricWidgetConfig;
  onClose: () => void;
  onSave: (updates: Partial<MetricWidgetConfig>) => void;
}) => {
  const [title, setTitle] = useState(widget.customTitle ?? "");
  const [lineColor, setLineColor] = useState(widget.lineColor ?? "");

  // Host / item swap
  const [hosts, setHosts] = useState<Host[]>([]);
  const [newHostname, setNewHostname] = useState("");
  const [newItems, setNewItems] = useState<{ itemid: string; name: string; key_: string }[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [newItemId, setNewItemId] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(widget.customTitle ?? "");
      setLineColor(widget.lineColor ?? "");
      setNewHostname("");
      setNewItems([]);
      setNewItemId("");
      api.listHosts().then((r) => setHosts(r.hosts)).catch(() => {});
    }
  }, [open, widget.customTitle, widget.lineColor]);

  useEffect(() => {
    if (!newHostname) { setNewItems([]); setNewItemId(""); return; }
    setItemsLoading(true);
    setNewItemId("");
    api.listItems(newHostname)
      .then((r) => setNewItems(r.items.filter((i) => i.value_type === "0" || i.value_type === "3")))
      .catch(() => setNewItems([]))
      .finally(() => setItemsLoading(false));
  }, [newHostname]);

  const handleSave = () => {
    const updates: Partial<MetricWidgetConfig> = {
      customTitle: title.trim() || undefined,
      lineColor: lineColor || undefined,
    };
    if (newItemId && newHostname) {
      const item = newItems.find((i) => i.itemid === newItemId);
      if (item) {
        updates.itemid = item.itemid;
        updates.itemName = item.name;
        updates.hostname = newHostname;
        if (!title.trim()) updates.customTitle = undefined;
      }
    }
    onSave(updates);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography fontWeight={700}>Configure Metric</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 0.25 }}>
                Host
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {widget.hostname}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 0.25 }}>
                Item
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                {widget.customTitle ?? widget.itemName}
              </Typography>
            </Box>
          </Box>
          <TextField
            size="small"
            label="Custom title"
            placeholder={widget.itemName}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            helperText="Leave blank to use the item name"
          />
          <Box>
            <Typography variant="body2" sx={{ mb: 1, color: "text.secondary", fontSize: "0.78rem" }}>
              Line color
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
              {PRESET_COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => setLineColor(lineColor === c ? "" : c)}
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    bgcolor: c,
                    cursor: "pointer",
                    border: lineColor === c ? "2px solid white" : "2px solid transparent",
                    outline: lineColor === c ? `2px solid ${c}` : "none",
                    transition: "transform 0.12s",
                    "&:hover": { transform: "scale(1.25)" },
                  }}
                />
              ))}
              {lineColor && (
                <Typography
                  variant="caption"
                  onClick={() => setLineColor("")}
                  sx={{ color: "text.disabled", cursor: "pointer", "&:hover": { color: "text.primary" } }}
                >
                  Reset
                </Typography>
              )}
            </Box>
          </Box>
          <Divider />
          <Box>
            <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600, fontSize: "0.8rem" }}>
              Change host / item
            </Typography>
            <Stack spacing={1.5}>
              <FormControl size="small" fullWidth>
                <InputLabel>Host</InputLabel>
                <Select
                  label="Host"
                  value={newHostname}
                  onChange={(e) => setNewHostname(e.target.value)}
                >
                  <MenuItem value="">
                    <Typography sx={{ color: "text.disabled", fontSize: "0.82rem" }}>
                      Select a host…
                    </Typography>
                  </MenuItem>
                  {hosts.map((h) => (
                    <MenuItem key={h.hostid} value={h.host}>
                      {h.host}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {newHostname && (
                <FormControl size="small" fullWidth>
                  <InputLabel>Item</InputLabel>
                  <Select
                    label="Item"
                    value={newItemId}
                    onChange={(e) => setNewItemId(e.target.value)}
                    disabled={itemsLoading}
                  >
                    {itemsLoading ? (
                      <MenuItem value="" disabled>Loading…</MenuItem>
                    ) : newItems.length === 0 ? (
                      <MenuItem value="" disabled>No numeric items on this host</MenuItem>
                    ) : (
                      newItems.map((i) => (
                        <MenuItem key={i.itemid} value={i.itemid}>
                          <Box>
                            <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>
                              {i.name}
                            </Typography>
                            <Typography sx={{ fontSize: "0.7rem", fontFamily: "monospace", color: "text.secondary" }}>
                              {i.key_}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
              )}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
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
  const [configOpen, setConfigOpen] = useState(false);
  const displayTitle = widget.customTitle ?? widget.itemName;

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
              title={displayTitle}
            >
              {displayTitle}
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
          <Tooltip title="Configure metric">
            <IconButton
              size="small"
              onClick={() => setConfigOpen(true)}
              sx={{ color: "text.disabled", "&:hover": { color: "primary.light" }, p: 0.3 }}
            >
              <TuneIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
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
          key={widget.itemid}
          itemid={widget.itemid}
          minutes={periodOption.minutes}
          alertEvents={alertEvents}
          lineColor={widget.lineColor}
          onPeriodChange={(delta) =>
            onUpdate({
              periodIdx: Math.max(0, Math.min(PERIOD_OPTIONS.length - 1, widget.periodIdx + delta)),
            })
          }
        />
      </Box>

      <MetricConfigDialog
        open={configOpen}
        widget={widget}
        onClose={() => setConfigOpen(false)}
        onSave={(updates) => onUpdate(updates)}
      />
    </Paper>
  );
};

// ── Problems tab ──────────────────────────────────────────────────────

const ProblemsTab = () => {
  const { user: authUser } = useAuth();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverities, setSelectedSeverities] = useState<number[]>([]);
  const [hostFilter, setHostFilter] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set());

  // Ack dialog state
  const [ackTarget, setAckTarget] = useState<Problem | null>(null);
  const [ackNote, setAckNote] = useState("");

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

  const handleAcknowledge = useCallback(async (problem: Problem, note: string) => {
    const { eventid } = problem;
    setAcknowledging((prev) => new Set([...prev, eventid]));
    setAckTarget(null);
    setAckNote("");
    try {
      const res = await api.acknowledgeProblem(eventid, {
        problem_name: problem.name,
        hostname: problem.hostname,
        severity: problem.severity,
        note,
      });
      const now = new Date().toISOString();
      setProblems((prev) =>
        prev.map((p) =>
          p.eventid === eventid
            ? { ...p, acknowledged: true, ack_user: res.acknowledged_by, ack_time: now, ack_note: note }
            : p,
        ),
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
                      <Tooltip
                        title={
                          p.ack_user ? (
                            <Box>
                              <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                                Acknowledged by {p.ack_user}
                              </Typography>
                              {p.ack_time && (
                                <Typography variant="caption" sx={{ display: "block" }}>
                                  {new Date(p.ack_time).toLocaleString()}
                                </Typography>
                              )}
                              {p.ack_note && (
                                <Typography variant="caption" sx={{ display: "block", fontStyle: "italic", mt: 0.25 }}>
                                  "{p.ack_note}"
                                </Typography>
                              )}
                            </Box>
                          ) : "Acknowledged"
                        }
                      >
                        <Chip
                          label={p.ack_user ? `Ack'd by ${p.ack_user}` : "Ack'd"}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.68rem" }}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title="Acknowledge this problem">
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => { setAckTarget(p); setAckNote(""); }}
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

      {/* Acknowledge dialog */}
      <Dialog open={ackTarget !== null} onClose={() => setAckTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Acknowledge problem</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {ackTarget && (
              <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{ackTarget.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {ackTarget.hostname} · {ackTarget.severity_name}
                </Typography>
              </Box>
            )}
            <Typography variant="body2" color="text.secondary">
              Acknowledging as <strong>{authUser?.username ?? "you"}</strong>. Add an optional note explaining what was done.
            </Typography>
            <TextField
              size="small" multiline minRows={2} fullWidth
              label="Note (optional)"
              placeholder="e.g. Restarted the service, investigating further…"
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAckTarget(null)}>Cancel</Button>
          <Button variant="contained" color="success"
            disabled={ackTarget ? acknowledging.has(ackTarget.eventid) : false}
            onClick={() => { if (ackTarget) handleAcknowledge(ackTarget, ackNote); }}>
            Acknowledge
          </Button>
        </DialogActions>
      </Dialog>
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

// Minimal tone helper for in-page sound preview (mirrors AppShell logic)
type OscType = "sine" | "square" | "triangle" | "sawtooth";
const _tone = (
  ctx: AudioContext,
  opts: { freq: number; start: number; dur: number; type?: OscType; peak?: number },
) => {
  const g = ctx.createGain();
  g.connect(ctx.destination);
  const t0 = ctx.currentTime + opts.start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(opts.peak ?? 0.35, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.freq;
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.05);
};

const PREVIEW_SOUNDS: Record<string, (ctx: AudioContext) => void> = {
  beep: (ctx) => { _tone(ctx, { freq: 740, start: 0, dur: 0.22 }); _tone(ctx, { freq: 740, start: 0.28, dur: 0.22 }); },
  chime: (ctx) => [523, 659, 784].forEach((f, i) => _tone(ctx, { freq: f, start: i * 0.13, dur: 0.35, type: "triangle", peak: 0.3 })),
  ping: (ctx) => _tone(ctx, { freq: 880, start: 0, dur: 0.5, type: "triangle", peak: 0.32 }),
  alarm: (ctx) => [0, 1, 2, 3].forEach((i) => _tone(ctx, { freq: i % 2 ? 660 : 880, start: i * 0.16, dur: 0.13, type: "square", peak: 0.28 })),
};

const BUILTIN_SOUND_OPTIONS: { key: string; label: string }[] = [
  { key: "default", label: "Default (global)" },
  { key: "none", label: "No sound" },
  { key: "beep", label: "Beep" },
  { key: "chime", label: "Chime" },
  { key: "ping", label: "Ping" },
  { key: "alarm", label: "Alarm" },
];

const getRuleSounds = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem("alertRuleSounds") ?? "{}");
  } catch {
    return {};
  }
};

const setRuleSound = (ruleId: number, soundKey: string) => {
  const sounds = getRuleSounds();
  if (soundKey === "default") {
    delete sounds[ruleId];
  } else {
    sounds[ruleId] = soundKey;
  }
  localStorage.setItem("alertRuleSounds", JSON.stringify(sounds));
};

const AlertRulesTab = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [ruleSounds, setRuleSoundsState] = useState<Record<string, string>>(getRuleSounds);

  // Edit dialog state
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [editOperator, setEditOperator] = useState(">");
  const [editThreshold, setEditThreshold] = useState("");
  const [editSeverity, setEditSeverity] = useState(2);
  const [editSound, setEditSound] = useState("default");
  const [editHost, setEditHost] = useState("");
  const [editItemId, setEditItemId] = useState("");
  const [editItemName, setEditItemName] = useState("");
  const [editItems, setEditItems] = useState<ItemDef2[]>([]);
  const [editItemsLoading, setEditItemsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteRuleId, setConfirmDeleteRuleId] = useState<number | null>(null);

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
  const [addSound, setAddSound] = useState("default");
  const [creating, setCreating] = useState(false);

  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  useEffect(() => { listSounds().then(setCustomSounds).catch(() => {}); }, []);

  const [globalPreset, setGlobalPreset] = useState(
    () => localStorage.getItem("alertSoundPreset") ?? "beep",
  );
  useEffect(() => {
    const onPresetChange = () =>
      setGlobalPreset(localStorage.getItem("alertSoundPreset") ?? "beep");
    window.addEventListener("alertSoundPresetChanged", onPresetChange);
    return () => window.removeEventListener("alertSoundPresetChanged", onPresetChange);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "alertRuleSounds") setRuleSoundsState(getRuleSounds());
      if (e.key === "alertSoundPreset") setGlobalPreset(localStorage.getItem("alertSoundPreset") ?? "beep");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const soundOptions = useMemo(
    () => [
      ...BUILTIN_SOUND_OPTIONS,
      ...customSounds.map((s) => ({ key: s.id, label: s.name })),
    ],
    [customSounds],
  );

  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleSoundPreview = (previewKey: string, soundKey: string) => {
    if (soundKey === "none") return;
    // "default" means "use whatever the global preset is"
    const effectiveKey = soundKey === "default"
      ? (localStorage.getItem("alertSoundPreset") ?? "beep")
      : soundKey;
    if (effectiveKey === "none") return;
    const stopCurrent = () => {
      if (previewCtxRef.current) { void previewCtxRef.current.close(); previewCtxRef.current = null; }
      if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    };
    if (previewingKey === previewKey) { stopCurrent(); setPreviewingKey(null); return; }
    stopCurrent();
    setPreviewingKey(previewKey);
    if (isCustomId(effectiveKey)) {
      playSoundById(effectiveKey).then((audio) => {
        if (!audio) { setPreviewingKey(null); return; }
        previewAudioRef.current = audio;
        audio.onended = () => { previewAudioRef.current = null; setPreviewingKey(null); };
      }).catch(() => setPreviewingKey(null));
    } else {
      try {
        const AudioCtx = window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) { setPreviewingKey(null); return; }
        const ctx = new AudioCtx();
        previewCtxRef.current = ctx;
        (PREVIEW_SOUNDS[effectiveKey] ?? PREVIEW_SOUNDS.beep)(ctx);
        setTimeout(() => {
          if (previewCtxRef.current === ctx) { void ctx.close(); previewCtxRef.current = null; setPreviewingKey(null); }
        }, 2000);
      } catch { setPreviewingKey(null); }
    }
  };

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

  // Reset add dialog state when opened; also refresh custom sounds in case new ones were uploaded
  useEffect(() => {
    if (!addOpen) return;
    listSounds().then(setCustomSounds).catch(() => {});
    setSelectedHost("");
    setSelectedItemIds(new Set());
    setItems([]);
    setItemSearch("");
    setOperator(">");
    setThreshold("");
    setSeverity(2);
    setAddSound("default");
    api.listHosts().then((r) => setHosts(r.hosts));
  }, [addOpen]);

  // Populate edit dialog when a rule is selected; also refresh custom sounds
  useEffect(() => {
    if (!editRule) return;
    listSounds().then(setCustomSounds).catch(() => {});
    api.listHosts().then((r) => setHosts(r.hosts)).catch(() => {});
    setEditOperator(editRule.operator);
    setEditThreshold(String(editRule.threshold));
    setEditSeverity(editRule.severity);
    setEditSound(ruleSounds[editRule.id] ?? "default");
    setEditHost(editRule.hostname);
    setEditItemId(editRule.item_id);
    setEditItemName(editRule.item_name);
  }, [editRule, ruleSounds]);

  // Reload items when editHost changes
  useEffect(() => {
    if (!editHost) { setEditItems([]); return; }
    setEditItemsLoading(true);
    api.listItems(editHost, true)
      .then((r) => {
        const numeric = r.items.filter(
          (i: { value_type: string }) => i.value_type === "0" || i.value_type === "3",
        );
        setEditItems(numeric);
      })
      .catch(() => {})
      .finally(() => setEditItemsLoading(false));
  }, [editHost]);

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
      const results = await Promise.all(
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
      if (addSound !== "default") {
        const updated = getRuleSounds();
        results.forEach((r) => { updated[r.id] = addSound; });
        localStorage.setItem("alertRuleSounds", JSON.stringify(updated));
        setRuleSoundsState({ ...updated });
      }
      setAddOpen(false);
      loadRules();
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!editRule || !editThreshold || isNaN(parseFloat(editThreshold))) return;
    setSaving(true);
    try {
      await api.updateAlertRule(editRule.id, {
        operator: editOperator,
        threshold: parseFloat(editThreshold),
        severity: editSeverity,
        item_id: editItemId,
        item_name: editItemName,
        hostname: editHost,
      });
      setRuleSound(editRule.id, editSound);
      setRuleSoundsState(getRuleSounds());
      setEditRule(null);
      loadRules();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.deleteAlertRule(id);
    const updated = getRuleSounds();
    delete updated[id];
    localStorage.setItem("alertRuleSounds", JSON.stringify(updated));
    setRuleSoundsState({ ...updated });
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
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 110 }}>
                  Sound
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 70 }}>
                  Active
                </TableCell>
                <TableCell sx={{ width: 72 }} />
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
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {(() => {
                        const sk = ruleSounds[r.id] ?? "default";
                        const globalLabel = soundOptions.find((s) => s.key === globalPreset)?.label
                          ?? globalPreset.charAt(0).toUpperCase() + globalPreset.slice(1);
                        const label = sk === "default"
                          ? `Default (${globalLabel})`
                          : (soundOptions.find((s) => s.key === sk)?.label ?? sk);
                        const canPreview = sk !== "none";
                        const isPreviewing = previewingKey === `row-${r.id}`;
                        return (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                            <Tooltip title={isPreviewing ? "Stop preview" : canPreview ? `Preview: ${label}` : label}>
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={!canPreview}
                                  onClick={() => handleSoundPreview(`row-${r.id}`, sk)}
                                  sx={{ color: isPreviewing ? "primary.main" : sk === "none" ? "text.disabled" : "text.secondary" }}
                                >
                                  {isPreviewing
                                    ? <StopOutlinedIcon sx={{ fontSize: 15 }} />
                                    : sk === "none"
                                      ? <VolumeOffOutlinedIcon sx={{ fontSize: 15 }} />
                                      : <PlayArrowOutlinedIcon sx={{ fontSize: 15 }} />}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                              {label}
                            </Typography>
                          </Box>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="small"
                        checked={r.enabled}
                        onChange={() => handleToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ px: 0.5, whiteSpace: "nowrap" }}>
                      <Tooltip title="Edit rule">
                        <IconButton
                          size="small"
                          onClick={() => setEditRule(r)}
                          sx={{ color: "action.active", "&:hover": { color: "primary.main" } }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete rule">
                        <IconButton
                          size="small"
                          onClick={() => setConfirmDeleteRuleId(r.id)}
                          sx={{ color: "action.active", "&:hover": { color: "error.main" } }}
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

            {/* Sound */}
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Alert sound</InputLabel>
                <Select
                  label="Alert sound"
                  value={addSound}
                  onChange={(e) => setAddSound(e.target.value)}
                >
                  {soundOptions.map((s) => (
                    <MenuItem key={s.key} value={s.key}>
                      {s.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title={previewingKey === "add" ? "Stop preview" : "Preview sound"}>
                <span>
                  <IconButton
                    size="small"
                    disabled={addSound === "none"}
                    onClick={() => handleSoundPreview("add", addSound)}
                    sx={{ color: previewingKey === "add" ? "primary.main" : "text.secondary" }}
                  >
                    {previewingKey === "add"
                      ? <StopOutlinedIcon sx={{ fontSize: 18 }} />
                      : <PlayArrowOutlinedIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
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

      {/* Edit rule dialog */}
      <Dialog open={!!editRule} onClose={() => setEditRule(null)} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography fontWeight={700}>Edit Alert Rule</Typography>
          <IconButton size="small" onClick={() => setEditRule(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {/* Host */}
            <FormControl size="small" fullWidth>
              <InputLabel>Host</InputLabel>
              <Select
                label="Host"
                value={editHost}
                onChange={(e) => {
                  setEditHost(e.target.value);
                  setEditItemId("");
                  setEditItemName("");
                }}
              >
                {hosts.map((h) => (
                  <MenuItem key={h.hostid} value={h.host}>{h.host}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {/* Item */}
            <FormControl size="small" fullWidth disabled={!editHost || editItemsLoading}>
              <InputLabel>{editItemsLoading ? "Loading…" : "Item"}</InputLabel>
              <Select
                label={editItemsLoading ? "Loading…" : "Item"}
                value={editItemId}
                onChange={(e) => {
                  const selected = editItems.find((i) => i.itemid === e.target.value);
                  if (selected) { setEditItemId(selected.itemid); setEditItemName(selected.name); }
                }}
              >
                {editItems.map((i) => (
                  <MenuItem key={i.itemid} value={i.itemid}>
                    <Box>
                      <Typography sx={{ fontSize: "0.82rem" }}>{i.name}</Typography>
                      <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontFamily: "monospace" }}>{i.key_}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <FormControl size="small" sx={{ width: 110 }}>
                <InputLabel>Operator</InputLabel>
                <Select
                  label="Operator"
                  value={editOperator}
                  onChange={(e) => setEditOperator(e.target.value)}
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
                value={editThreshold}
                onChange={(e) => setEditThreshold(e.target.value)}
                sx={{ flex: 1 }}
              />
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Severity</InputLabel>
                <Select
                  label="Severity"
                  value={editSeverity}
                  onChange={(e) => setEditSeverity(Number(e.target.value))}
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
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Alert sound</InputLabel>
                <Select
                  label="Alert sound"
                  value={editSound}
                  onChange={(e) => setEditSound(e.target.value)}
                >
                  {soundOptions.map((s) => (
                    <MenuItem key={s.key} value={s.key}>
                      {s.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title={previewingKey === "edit" ? "Stop preview" : "Preview sound"}>
                <span>
                  <IconButton
                    size="small"
                    disabled={editSound === "none"}
                    onClick={() => handleSoundPreview("edit", editSound)}
                    sx={{ color: previewingKey === "edit" ? "primary.main" : "text.secondary" }}
                  >
                    {previewingKey === "edit"
                      ? <StopOutlinedIcon sx={{ fontSize: 18 }} />
                      : <PlayArrowOutlinedIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRule(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!editThreshold || isNaN(parseFloat(editThreshold)) || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm delete alert rule ── */}
      <Dialog open={confirmDeleteRuleId !== null} onClose={() => setConfirmDeleteRuleId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete alert rule?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently remove the alert rule and its sound assignment. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteRuleId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => {
            if (confirmDeleteRuleId === null) return;
            await handleDelete(confirmDeleteRuleId);
            setConfirmDeleteRuleId(null);
          }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ── Notifications tab ─────────────────────────────────────────────────

const NotificationsTab = () => {
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selectedSeverities, setSelectedSeverities] = useState<number[]>([]);
  const [hostFilter, setHostFilter] = useState("");

  const loadEvents = useCallback(() => {
    setLoading(true);
    api
      .getAlertEvents(500)
      .then((r) => { setFetchError(false); setEvents(r.events); })
      .catch(() => setFetchError(true))
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
      {fetchError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFetchError(false)}>
          Failed to load alert events. Check your connection and try again.
        </Alert>
      )}
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

// ── Problem History tab ───────────────────────────────────────────────

type HistoryProblem = {
  eventid: string;
  name: string;
  hostname: string;
  severity: number;
  severity_name: string;
  clock: number;
  r_clock: number;
  resolved: boolean;
  duration_seconds: number;
  acknowledged: boolean;
  ack_user: string | null;
  ack_note: string;
  ack_time: number | null;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
};

const formatAbsTime = (clock: number): string =>
  new Date(clock * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
] as const;

const ProblemHistoryTab = () => {
  const [hours, setHours] = useState<number>(24);
  const [severityMin, setSeverityMin] = useState(0);
  const [search, setSearch] = useState("");
  const [problems, setProblems] = useState<HistoryProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const { palette } = useTheme();
  const isDark = palette.mode === "dark";

  const load = useCallback(() => {
    setLoading(true);
    setFetchError(false);
    api
      .getProblemHistory({ hours, severityMin: severityMin > 0 ? severityMin : undefined })
      .then((r) => setProblems(r.problems))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [hours, severityMin]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return problems;
    return problems.filter(
      (p) => p.name.toLowerCase().includes(q) || p.hostname.toLowerCase().includes(q),
    );
  }, [problems, search]);

  const rangeLabel = TIME_RANGES.find((r) => r.hours === hours)?.label ?? `${hours}h`;

  return (
    <Stack spacing={2}>
      {/* Filters */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {TIME_RANGES.map(({ label, hours: h }) => (
            <Button
              key={label}
              size="small"
              variant={hours === h ? "contained" : "outlined"}
              onClick={() => setHours(h)}
              sx={{ minWidth: 42, px: 1, fontSize: "0.75rem", textTransform: "none" }}
            >
              {label}
            </Button>
          ))}
        </Box>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Min severity</InputLabel>
          <Select
            value={severityMin}
            label="Min severity"
            onChange={(e) => setSeverityMin(Number(e.target.value))}
          >
            <MenuItem value={0}>All</MenuItem>
            <MenuItem value={2}>Low+</MenuItem>
            <MenuItem value={3}>Average+</MenuItem>
            <MenuItem value={4}>High+</MenuItem>
            <MenuItem value={5}>Disaster only</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          placeholder="Filter by problem or host…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
          InputProps={{
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch("")} edge="end">
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={load} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Summary */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {loading && <CircularProgress size={13} />}
        <Typography variant="caption" color="text.secondary">
          {loading
            ? "Loading…"
            : fetchError
              ? "Failed to load — Zabbix may be unreachable"
              : `${filtered.length} problem${filtered.length !== 1 ? "s" : ""} in the last ${rangeLabel}${search ? " (filtered)" : ""}`}
        </Typography>
      </Box>

      {fetchError ? (
        <Alert severity="warning">Could not load problem history. Check Zabbix connectivity.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", width: 145 }}>Started</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", width: 140 }}>Host</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem" }}>Problem</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", width: 90 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", width: 110 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", width: 80 }}>Duration</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.72rem", width: 130 }}>Ack'd by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && problems.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {[120, 120, 240, 70, 90, 60, 110].map((w, j) => (
                      <TableCell key={j}><Skeleton width={w} height={14} /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.disabled">No problems found in this window</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.eventid} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                    <TableCell sx={{ fontSize: "0.78rem", fontFamily: "monospace", color: "text.secondary", whiteSpace: "nowrap" }}>
                      {formatAbsTime(p.clock)}
                    </TableCell>
                    <TableCell>
                      <Typography noWrap sx={{ fontSize: "0.82rem", fontWeight: 500, maxWidth: 130 }}>{p.hostname}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography noWrap sx={{ fontSize: "0.82rem", maxWidth: 320 }}>{p.name}</Typography>
                    </TableCell>
                    <TableCell><SeverityChip severity={p.severity} /></TableCell>
                    <TableCell>
                      {p.resolved ? (
                        <Tooltip title={`Resolved ${formatAbsTime(p.r_clock)}`} placement="top">
                          <Chip label="Resolved" size="small" sx={{ height: 18, fontSize: "0.63rem", bgcolor: isDark ? "rgba(22,163,74,0.18)" : "rgba(22,163,74,0.1)", color: "#16a34a", border: "none", cursor: "default" }} />
                        </Tooltip>
                      ) : (
                        <Chip label="Active" size="small" sx={{ height: 18, fontSize: "0.63rem", bgcolor: isDark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.1)", color: "#ef4444", border: "none" }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.78rem", fontFamily: "monospace", color: "text.secondary" }}>
                      {formatDuration(p.duration_seconds)}
                    </TableCell>
                    <TableCell>
                      {p.acknowledged && p.ack_user ? (
                        <Tooltip title={p.ack_note ? `"${p.ack_note}"` : "No note"} placement="top">
                          <Typography variant="caption" sx={{ color: "primary.main", cursor: "default", textDecoration: "underline dotted" }}>
                            {p.ack_user}
                          </Typography>
                        </Tooltip>
                      ) : p.acknowledged ? (
                        <Typography variant="caption" color="success.main">✓</Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
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
          Active problems, alert notifications, item history charts, custom alert rules, and problem history search
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
        <Tab
          label="History"
          sx={{ fontSize: "0.82rem", textTransform: "none", minHeight: 40 }}
        />
      </Tabs>

      {tab === 0 && <ProblemsTab />}
      {tab === 1 && <NotificationsTab />}
      {tab === 2 && <ItemHistoryTab />}
      {tab === 3 && <AlertRulesTab />}
      {tab === 4 && <ProblemHistoryTab />}
    </Box>
  );
};
