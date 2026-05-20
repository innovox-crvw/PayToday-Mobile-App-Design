import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
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
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined'
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { AccountInfoCard } from '../../components/profile/AccountInfoCard'
import { AccountSectionHeader } from '../../components/profile/AccountSectionHeader'
import { useStorePathPrefix } from './profilePaths'
import { formatDobDisplay, formatUiLanguageDisplay } from './accountNav'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { readUiLanguage } from '../../lib/appPreferences'

type AddressRow = {
  city: string
  region: string | null
  country: string
  is_default: boolean
}

type EditSection = 'name' | 'dob' | 'email' | 'password' | null

export function ProfilePersonalPage() {
  const prefix = useStorePathPrefix()
  const navigate = useNavigate()

  const confirmPath = prefix ? `${prefix}/profile/confirm-email` : '/profile/confirm-email'
  const addressesPath = prefix ? `${prefix}/profile/addresses` : '/profile/addresses'
  const settingsPath = prefix ? `${prefix}/profile/settings` : '/profile/settings'
  const signInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile/personal`)}`

  const { user, loading } = useAuthMe()

  const [editSection, setEditSection] = useState<EditSection>(null)
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [regionLabel, setRegionLabel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingDob, setSavingDob] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [resending, setResending] = useState(false)
  const [msg, setMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const uiLanguage = useMemo(() => formatUiLanguageDisplay(readUiLanguage()), [])

  const loadRegion = useCallback(async () => {
    if (!user) {
      setRegionLabel(null)
      return
    }
    try {
      const res = await apiFetch('/api/addresses')
      if (!res.ok) return
      const data = (await res.json()) as { items?: AddressRow[] }
      const items = data.items ?? []
      const pick = items.find((a) => a.is_default) ?? items[0]
      if (!pick) {
        setRegionLabel(null)
        return
      }
      const parts = [pick.country === 'NA' ? 'Namibia' : pick.country, pick.city]
      if (pick.region?.trim()) parts.splice(1, 0, pick.region.trim())
      setRegionLabel(parts.filter(Boolean).join(', '))
    } catch {
      setRegionLabel(null)
    }
  }, [user])

  useEffect(() => {
    if (user?.fullName != null) setFullName(user.fullName || '')
    else if (!user) setFullName('')
    if (user?.dateOfBirth) setDateOfBirth(user.dateOfBirth)
    else if (!user) setDateOfBirth('')
  }, [user])

  useEffect(() => {
    void loadRegion()
  }, [loadRegion])

  function openEdit(section: EditSection) {
    if (!user) return
    setEditSection(section)
    setMsg(null)
    if (section === 'name') setFullName(user.fullName || '')
    if (section === 'dob') setDateOfBirth(user.dateOfBirth || '')
    if (section === 'email') {
      setNewEmail('')
      setConfirmEmail('')
      setEmailPassword('')
    }
    if (section === 'password') {
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }
  }

  function cancelEdit() {
    setEditSection(null)
    setMsg(null)
  }

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
      setEditSection(null)
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
      setMsg({ text: 'Date of birth saved.', severity: 'success' })
      setEditSection(null)
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
      setMsg({ text: 'Email updated.', severity: 'success' })
      setEditSection(null)
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
      setMsg({ text: 'Password updated.', severity: 'success' })
      setEditSection(null)
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
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        setMsg({ text: 'Could not resend', severity: 'error' })
        return
      }
      setMsg({ text: 'Verification email sent.', severity: 'success' })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', severity: 'error' })
    } finally {
      setResending(false)
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
      <>
        <AccountSectionHeader title="Personal information" description="Sign in to manage your account." />
        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
          <CardContent sx={{ py: 4, textAlign: 'center' }}>
            <Box sx={{ color: 'text.secondary', mb: 2 }}>
              <PersonOffOutlinedIcon sx={{ fontSize: 56 }} />
            </Box>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              Sign in required
            </Typography>
            <Button component={RouterLink} to={signInPath} variant="contained" color="secondary" size="large" sx={{ fontWeight: 700, mt: 1 }}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </>
    )
  }

  const verified = user.emailVerified !== false
  const nameDisplay = user.fullName?.trim() || 'Not set'
  const dobDisplay = formatDobDisplay(user.dateOfBirth)
  const regionDisplay = regionLabel ?? 'Add a delivery address'

  return (
    <Stack spacing={3}>
      <AccountSectionHeader
        title="Personal information"
        description="Manage your personal information, including phone numbers and email address where you can be contacted."
      />

      {msg ? (
        <Alert severity={msg.severity} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      ) : null}

      {!verified ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" disabled={resending} onClick={() => void resendVerification()}>
              {resending ? 'Sending…' : 'Resend link'}
            </Button>
          }
        >
          Email not verified.{' '}
          <RouterLink to={confirmPath}>Confirm with a token</RouterLink>.
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 2,
        }}
      >
        <AccountInfoCard
          title="Name"
          value={nameDisplay}
          icon={<PersonOutlineIcon fontSize="small" />}
          editing={editSection === 'name'}
          onEdit={() => openEdit('name')}
          onCancel={cancelEdit}
          onSave={() => void saveName()}
          saving={saving}
          saveLabel="Save name"
          editContent={
            <TextField
              label="Display name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              fullWidth
              size="small"
              autoComplete="name"
            />
          }
        />

        <AccountInfoCard
          title="Date of birth"
          value={dobDisplay}
          icon={<CalendarMonthOutlinedIcon fontSize="small" />}
          editing={editSection === 'dob'}
          onEdit={() => openEdit('dob')}
          onCancel={cancelEdit}
          onSave={() => void saveDob()}
          saving={savingDob}
          saveLabel="Save"
          editContent={
            <TextField
              label="Date of birth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              helperText="Used for age-restricted products when enabled."
            />
          }
        />

        <AccountInfoCard
          title="Country / region"
          value={regionDisplay}
          icon={<PublicOutlinedIcon fontSize="small" />}
          onEdit={() => navigate(addressesPath)}
          editLabel="Manage addresses"
        />

        <AccountInfoCard
          title="Language"
          value={uiLanguage}
          icon={<TranslateOutlinedIcon fontSize="small" />}
          onEdit={() => navigate(settingsPath)}
          editLabel="Open settings"
        />

        <AccountInfoCard
          title="Password"
          value="••••••••"
          icon={<LockOutlinedIcon fontSize="small" />}
          editing={editSection === 'password'}
          onEdit={() => openEdit('password')}
          onCancel={cancelEdit}
          onSave={() => void savePassword()}
          saving={savingPw}
          saveLabel="Update password"
          editContent={
            <Stack spacing={1.25}>
              <TextField
                label="Current password"
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                fullWidth
                size="small"
                autoComplete="current-password"
              />
              <TextField
                label="New password"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                fullWidth
                size="small"
                autoComplete="new-password"
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                fullWidth
                size="small"
                autoComplete="new-password"
              />
            </Stack>
          }
        />

        <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
          <AccountInfoCard
            title="Contactable at"
            value={user.email}
            icon={<MailOutlineIcon fontSize="small" />}
            editing={editSection === 'email'}
            onEdit={() => openEdit('email')}
            onCancel={cancelEdit}
            onSave={() => void saveEmail()}
            saving={savingEmail}
            saveLabel="Update email"
            editContent={
              <Stack spacing={1.25}>
                <Typography variant="caption" color="text.secondary">
                  Current: {user.email}
                </Typography>
                <TextField
                  label="New email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  fullWidth
                  size="small"
                  autoComplete="email"
                />
                <TextField
                  label="Confirm new email"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Current password"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  fullWidth
                  size="small"
                  autoComplete="current-password"
                />
              </Stack>
            }
          />
        </Box>
      </Box>
    </Stack>
  )
}
