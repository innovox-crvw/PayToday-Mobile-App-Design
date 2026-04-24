import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { APP_DISPLAY_NAME } from '../../theme/branding'

export function ProfileDeleteAccountPage() {
  const prefix = useStorePathPrefix()
  const navigate = useNavigate()
  const profileHubPath = prefix ? `${prefix}/profile` : '/profile'
  const signInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile`)}`
  const shopPath = prefix ? `${prefix}/shop` : '/shop'

  const { user, loading, refresh } = useAuthMe()
  const [confirmEmail, setConfirmEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; severity: 'error' | 'warning' } | null>(null)

  /** PayToday-linked rows omit password_hash; anything else (including unknown) requires current password. */
  const needsPassword = user?.accountKind !== 'paytoday'
  const isStaff = user && user.role !== 'customer'

  const canSubmit = useMemo(() => {
    if (!user || isStaff) return false
    const emailOk = confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase()
    const pwOk = !needsPassword || currentPassword.length > 0
    return emailOk && pwOk && ack && !busy
  }, [user, isStaff, confirmEmail, needsPassword, currentPassword, ack, busy])

  async function deleteAccount() {
    if (!user || isStaff) return
    setMsg(null)
    setBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmEmail: confirmEmail.trim(),
          ...(needsPassword ? { currentPassword } : {}),
        }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not delete account', severity: 'error' })
        return
      }
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      await refresh()
      navigate(shopPath, { replace: true })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Request failed', severity: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProfilePageShell>
      <WalletSubheader title="Delete account" />
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        Permanently remove your storefront profile, saved addresses, notifications, and linked wallet activity in this
        app. Past orders stay in the store as guest history without your account link.
      </Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : !user ? (
        <Alert severity="info">
          Sign in to delete your account.{' '}
          <Typography component={RouterLink} to={signInPath} variant="body2" fontWeight={700}>
            Sign in
          </Typography>
        </Alert>
      ) : isStaff ? (
        <Alert severity="warning">
          This profile is not a customer account. Staff and operations users cannot be deleted here — contact your
          administrator.
        </Alert>
      ) : (
        <>
          <Alert severity="warning" icon={<DeleteForeverOutlinedIcon fontSize="inherit" />}>
            <strong>This cannot be undone.</strong> You will be signed out immediately after removal.
          </Alert>

          {user.accountKind === 'paytoday' ? (
            <Alert severity="info">
              You sign in with {APP_DISPLAY_NAME}. We remove your linked store profile here; your {APP_DISPLAY_NAME} identity may
              still exist for other services — use {APP_DISPLAY_NAME} support if you need that closed too.
            </Alert>
          ) : null}

          {msg ? (
            <Alert severity={msg.severity} onClose={() => setMsg(null)}>
              {msg.text}
            </Alert>
          ) : null}

          <Typography variant="subtitle2" fontWeight={800}>
            Confirm
          </Typography>
          <TextField
            label="Type your email to confirm"
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            fullWidth
            autoComplete="off"
            helperText={`Must match ${user.email}`}
          />

          {needsPassword ? (
            <TextField
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
            />
          ) : null}

          <FormControlLabel
            control={<Checkbox checked={ack} onChange={(_, v) => setAck(v)} color="error" />}
            label={
              <Typography variant="body2">
                I understand my profile, addresses, and in-app notifications in this store will be deleted.
              </Typography>
            }
          />

          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Button component={RouterLink} to={profileHubPath} variant="outlined" color="inherit" disabled={busy}>
              Cancel
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              color="error"
              disabled={!canSubmit}
              onClick={() => void deleteAccount()}
              sx={{ fontWeight: 800 }}
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </Button>
          </Stack>
        </>
      )}
    </ProfilePageShell>
  )
}
