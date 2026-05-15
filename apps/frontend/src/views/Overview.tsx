"use client";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { Box, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import Link from "next/link";

export const Overview = () => (
  <Stack spacing={3}>
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -0.8 }}>
        Zabbix DevOps
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        Create hosts, add monitoring items, and export inventory to Excel.
      </Typography>
    </Box>

    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <Card sx={{ flex: 1, overflow: "hidden", borderColor: "rgba(34,211,238,0.24)" }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            Hosts
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Provision and manage servers
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Create, list, and delete Zabbix hosts.
          </Typography>
          <Button component={Link} href="/hosts" sx={{ mt: 2 }} variant="contained">
            Go to Hosts
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ flex: 1, overflow: "hidden", borderColor: "rgba(52,211,153,0.25)" }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            Inventory
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Export to Excel
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Download a live inventory report.
          </Typography>
          <Button
            startIcon={<DownloadOutlinedIcon />}
            sx={{ mt: 2 }}
            color="secondary"
            variant="contained"
            href="/api/hosts/download"
          >
            Download .xlsx
          </Button>
        </CardContent>
      </Card>
    </Stack>
  </Stack>
);
