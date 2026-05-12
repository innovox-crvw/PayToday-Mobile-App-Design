import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken } from '../../api/client'

export function ProfilePersonalPage() {
  const prefix = useStorePathPrefix()
  const confirmPath = prefix ? `${prefix}/profile/confirm-email` : '/profile/confirm-email'
  const profileHubPath = prefix ? `${prefix}/profile` : '/profile'

  const { user, loading } = useAuthMe()
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingDob, setSavingDob] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [resending, setResending] = useState(false)
  const [msg, setMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (user?.fullName != null) setFullName(user.fullName || '')
    else if (!user) setFullName('')
    if (user?.dateOfBirth) setDateOfBirth(user.dateOfBirth)
    else if (!user) setDateOfBirth('')
  }, [user])

  async function saveName() {
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
      setMsg({ text: 'Display name saved.', severity: 'success' })
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function saveDob() {
    if (!user) return
    setMsg(null)
    setSavingDob(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateOfBirth: dateOfBirth.trim() || null }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not save', severity: 'error' })
        return
      }
      setMsg({ text: 'Date of birth saved. Used for age-restricted purchases when enabled on this store.', severity: 'success' })
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSavingDob(false)
    }
  }

  async function saveEmail() {
    if (!user) return
    setMsg(null)
    setSavingEmail(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          confirmEmail: confirmEmail.trim().toLowerCase(),
          currentPassword: emailPassword,
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        emailVerificationRequired?: boolean
        devVerificationToken?: string
      }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not update email', severity: 'error' })
        return
      }
      setNewEmail('')
      setConfirmEmail('')
      setEmailPassword('')
      const parts = ['Email updated.']
      if (data.emailVerificationRequired) {
        parts.push('Confirm the new address using the link sent to your email, or open the link from the dev token if enabled.')
      }
      if (data.devVerificationToken) {
        parts.push(`Dev token: ${data.devVerificationToken}`)
      }
      setMsg({ text: parts.join(' '), severity: 'success' })
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSavingEmail(false)
    }
  }

  async function savePassword() {
    if (!user) return
    setMsg(null)
    setSavingPw(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw,
          confirmNewPassword: confirmPw,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not update password', severity: 'error' })
        return
      }
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setMsg({ text: 'Password updated. You remain signed in on this device.', severity: 'success' })
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSavingPw(false)
    }
  }

  async function resendVerification() {
    setMsg(null)
    setResending(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = (await res.json()) as { ok?: boolean; error?: string; alreadyVerified?: boolean; devVerificationToken?: string }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not resend', severity: 'error' })
        return
      }
      if (data.alreadyVerified) {
        setMsg({ text: 'Email is already verified.', severity: 'success' })
        window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
        return
      }
      const t = data.devVerificationToken
        ? `Verification link uses token (dev): open ${confirmPath}?token=${encodeURIComponent(data.devVerificationToken)}`
        : 'Use the link sent to your inbox, or open My account → Confirm email with the token from your email.'
      setMsg({ text: `If your account is eligible, a new verification link was prepared. ${t}`, severity: 'success' })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', severity: 'error' })
    } finally {
      setResending(false)
    }
  }

  if (loading) {
    return (
      <ProfilePageShell>
        <Stack alignItems="center" py={6}>
          <CircularProgress size={36} />
        </Stack>
      </ProfilePageShell>
    )
  }

  if (!user) {
    return (
      <ProfilePageShell>
        <WalletSubheader title="Personal" />
        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
          <CardContent sx={{ py: 4, textAlign: 'center' }}>
            <Box sx={{ color: 'text.secondary', mb: 2 }}>
              <PersonOffOutlinedIcon sx={{ fontSize: 56 }} />
            </Box>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              Sign in required
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
              Sign in to edit name, email, and password.
            </Typography>
            <Button component={RouterLink} to={profileHubPath} variant="contained" size="large" sx={{ fontWeight: 700 }}>
              Account
            </Button>
          </CardContent>
        </Card>
      </ProfilePageShell>
    )
  }

  const verified = user.emailVerified !== false

  return (
    <ProfilePageShell>
      <WalletSubheader title="Personal" />
      <Typography variant="body2" color="text.secondary">
        Name, email, and password. Email and password changes need your current password.
      </Typography>

      {msg ? (
        <Alert severity={msg.severity} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      ) : null}

      {!verified ? (
        <Alert severity="warning" action={
          <Button color="inherit" size="small" disabled={resending} onClick={() => void resendVerification()}>
            {resending ? 'Sending…' : 'Resend link'}
          </Button>
        }>
          Email not verified. Open the link from your inbox, or{' '}
          <RouterLink to={confirmPath}>confirm with a token</RouterLink>.
        </Alert>
      ) : null}

      <Typography variant="subtitle2" fontWeight={700}>
        Display name
      </Typography>
      <TextField label="Display name" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth autoComplete="name" />
      <Button variant="contained" sx={{ alignSelf: 'flex-start', fontWeight: 700 }} disabled={saving} onClick={() => void saveName()}>
        {saving ? 'Saving…' : 'Save name'}
      </Button>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>
        Date of birth
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Required for age-restricted products when the store enables liquor gating. Format YYYY-MM-DD. This is not ID verification.
      </Typography>
      <TextField
        label="Date of birth (YYYY-MM-DD)"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        fullWidth
        placeholder="1990-05-15"
        helperText={user.isAdult === false ? 'Recorded age is under 18 — alcohol catalogue and cart will stay blocked.' : undefined}
      />
      <Button variant="outlined" sx={{ alignSelf: 'flex-start', fontWeight: 700 }} disabled={savingDob} onClick={() => void saveDob()}>
        {savingDob ? 'Saving…' : 'Save date of birth'}
      </Button>

      <Divider sx={{ my: 1 }} />

      <Typography variant="subtitle2" fontWeight={700}>
        Email ({user.email})
      </Typography>
      <TextField
        label="New email"
        type="email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        fullWidth
        autoComplete="email"
      />
      <TextField
        label="Confirm new email"
        type="email"
        value={confirmEmail}
        onChange={(e) => setConfirmEmail(e.target.value)}
        fullWidth
        autoComplete="off"
      />
      <TextField
        label="Current password"
        type="password"
        value={emailPassword}
        onChange={(e) => setEmailPassword(e.target.value)}
        fullWidth
        autoComplete="current-password"
      />
      <Button variant="outlined" sx={{ alignSelf: 'flex-start', fontWeight: 700 }} disabled={savingEmail} onClick={() => void saveEmail()}>
        {savingEmail ? 'Updating…' : 'Update email'}
      </Button>

      <Divider sx={{ my: 1 }} />

      <Typography variant="subtitle2" fontWeight={700}>
        Password
      </Typography>
      <TextField label="Current password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} fullWidth autoComplete="current-password" />
      <TextField label="New password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} fullWidth autoComplete="new-password" />
      <TextField label="Confirm new password" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} fullWidth autoComplete="new-password" />
      <Button variant="outlined" sx={{ alignSelf: 'flex-start', fontWeight: 700 }} disabled={savingPw} onClick={() => void savePassword()}>
        {savingPw ? 'Updating…' : 'Update password'}
      </Button>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ pt: 1 }}>
        Forgot password? Use the link on the sign-in screen, or ask your admin for SSO accounts.
      </Typography>
    </ProfilePageShell>
  )
}
