import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Alert,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { api } from '../app/api'

const valueTypes = [
  { value: 0, label: 'Float' },
  { value: 1, label: 'String' },
  { value: 2, label: 'Log' },
  { value: 3, label: 'Integer' },
  { value: 4, label: 'Text' },
]

const operators = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '=', label: '=' },
  { value: '<>', label: '<>' },
]

const severities = [
  { value: 0, label: 'Not classified' },
  { value: 1, label: 'Information' },
  { value: 2, label: 'Warning' },
  { value: 3, label: 'Average' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Disaster' },
]

export function Items() {
  const [hostname, setHostname] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemKey, setItemKey] = useState('')
  const [valueType, setValueType] = useState(3)
  const [triggerHost, setTriggerHost] = useState('')
  const [triggerItemKey, setTriggerItemKey] = useState('')
  const [triggerName, setTriggerName] = useState('')
  const [operator, setOperator] = useState('>')
  const [threshold, setThreshold] = useState('')
  const [severity, setSeverity] = useState(3)
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  async function onCreate() {
    try {
      await api.addItem({
        hostname,
        item_name: itemName,
        item_key: itemKey,
        value_type: valueType,
      })
      setToast({ open: true, message: 'Item added successfully.', severity: 'success' })
      setItemName('')
      setItemKey('')
    } catch (e) {
      setToast({
        open: true,
        message: e instanceof Error ? e.message : String(e),
        severity: 'error',
      })
    }
  }

  async function onCreateTrigger() {
    const parsedThreshold = Number(threshold)
    if (!Number.isFinite(parsedThreshold)) {
      setToast({ open: true, message: 'Threshold must be a valid number.', severity: 'error' })
      return
    }
    try {
      await api.addTrigger({
        hostname: triggerHost,
        item_key: triggerItemKey,
        trigger_name: triggerName,
        operator,
        threshold: parsedThreshold,
        severity,
      })
      setToast({ open: true, message: 'Trigger added successfully.', severity: 'success' })
      setTriggerName('')
      setThreshold('')
    } catch (e) {
      setToast({
        open: true,
        message: e instanceof Error ? e.message : String(e),
        severity: 'error',
      })
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Items
        </Typography>
        <Typography color="text.secondary">Add monitoring items to existing hosts.</Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Add item
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Define the metric key and value type to attach a new check to an existing host.
            </Typography>
            <Divider />
            <TextField label="Hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            <TextField label="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
            <TextField label="Item key" value={itemKey} onChange={(e) => setItemKey(e.target.value)} />
            <TextField
              select
              label="Value type"
              value={valueType}
              onChange={(e) => setValueType(Number(e.target.value))}
            >
              {valueTypes.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <Box>
              <Button
                variant="contained"
                color="secondary"
                onClick={onCreate}
                disabled={!hostname || !itemName || !itemKey}
              >
                Add item
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Add trigger
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Create an alert rule on an existing item key (expression uses `.last()`).
            </Typography>
            <Divider />
            <TextField label="Hostname" value={triggerHost} onChange={(e) => setTriggerHost(e.target.value)} />
            <TextField
              label="Item key"
              value={triggerItemKey}
              onChange={(e) => setTriggerItemKey(e.target.value)}
              helperText="Example: system.cpu.load"
            />
            <TextField
              label="Trigger name"
              value={triggerName}
              onChange={(e) => setTriggerName(e.target.value)}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                select
                label="Operator"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                fullWidth
              >
                {operators.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Threshold"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                fullWidth
              />
            </Stack>
            <TextField
              select
              label="Severity"
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            >
              {severities.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
            <Box>
              <Button
                variant="contained"
                onClick={onCreateTrigger}
                disabled={!triggerHost || !triggerItemKey || !triggerName || threshold.trim() === ''}
              >
                Add trigger
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Stack>
  )
}

