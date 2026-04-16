import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken } from '../../api/client'

export function ProfilePersonalPage() {
  const prefix = useStorePathPrefix()
  const confirmPath = prefix ? `${prefix}/profile/confirm-email` : '/profile/confirm-email'
  const accountPath = prefix ? `${prefix}/account` : '/account'

  const { user, loading } = useAuthMe()
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (user?.fullName != null) setFullName(user.fullName || '')
    else if (!user) setFullName('')
  }, [user])

  async function save() {
    if (!user) return
    setMsg(null)
    setSaving(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim() || null }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not save', severity: 'error' })
        return
      }
      setMsg({ text: 'Saved.', severity: 'success' })
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Stack alignItems="center" py={6}>
        <CircularProgress size={36} />
      </Stack>
    )
  }

  if (!user) {
    return (
      <Stack spacing={2.5} sx={{ maxWidth: 480, mx: 'auto', pb: 4 }}>
        <WalletSubheader title="My Personal Details" />
        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
          <CardContent sx={{ py: 4, textAlign: 'center' }}>
            <Box sx={{ color: 'text.secondary', mb: 2 }}>
              <PersonOffOutlinedIcon sx={{ fontSize: 56 }} />
            </Box>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              No user account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
              Personal details are available after you sign in. Your display name and email from the account screen will show here.
            </Typography>
            <Button component={RouterLink} to={accountPath} variant="contained" size="large" sx={{ fontWeight: 700 }}>
              Go to Account
            </Button>
          </CardContent>
        </Card>
      </Stack>
    )
  }

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 480, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="My Personal Details" />
      <Typography variant="body2" color="text.secondary">
        Display name and email stay in sync with the Account screen. Changes here update your profile for the store and notifications.
      </Typography>

      {msg ? (
        <Alert severity={msg.severity} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      ) : null}

      <TextField
        label="Display name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        fullWidth
        autoComplete="name"
      />
      <TextField label="Email" value={user.email} fullWidth disabled helperText="Email is tied to your sign-in. Change it via support if needed." />

      <Typography variant="caption" color="text.secondary" display="block">
        Extra fields (phone, ID, date of birth) can be added when your KYC APIs are connected.
      </Typography>

      <Button component={RouterLink} to={confirmPath} variant="text" size="small" sx={{ alignSelf: 'flex-start' }}>
        Preview email confirmation flow
      </Button>

      <Button variant="contained" size="large" fullWidth sx={{ borderRadius: 2, fontWeight: 700, mt: 1 }} disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  )
}
