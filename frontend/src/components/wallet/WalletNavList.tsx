import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Card, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { walletCardSx } from '../../theme/walletTheme'

export type WalletNavItem = {
  to: string
  label: string
  secondary?: string
  icon?: ReactNode
}

export type WalletNavGroup = {
  title?: string
  items: WalletNavItem[]
}

export function WalletNavList(props: { groups: WalletNavGroup[] }) {
  const { groups } = props
  return (
    <Card elevation={0} sx={walletCardSx}>
      {groups.map((group, gi) => (
        <List key={gi} disablePadding>
          {group.title ? (
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={800}
              sx={{ display: 'block', px: 2, pt: gi === 0 ? 1.5 : 2, pb: 0.5 }}
            >
              {group.title}
            </Typography>
          ) : null}
          {group.items.map((item, ii) => {
            const isLast = ii === group.items.length - 1 && gi === groups.length - 1
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                sx={{
                  py: 1.75,
                  px: 2,
                  alignItems: item.secondary ? 'flex-start' : 'center',
                  borderBottom: isLast ? 0 : 1,
                  borderColor: 'divider',
                }}
              >
                {item.icon ? (
                  <ListItemIcon sx={{ color: 'primary.main', minWidth: 44, mt: item.secondary ? 0.25 : 0 }}>
                    {item.icon}
                  </ListItemIcon>
                ) : null}
                <ListItemText
                  primary={item.label}
                  secondary={item.secondary}
                  primaryTypographyProps={{ fontWeight: 700, fontSize: '0.95rem' }}
                />
                <ChevronRightIcon color="action" sx={{ opacity: 0.7, mt: item.secondary ? 0.5 : 0 }} />
              </ListItemButton>
            )
          })}
        </List>
      ))}
    </Card>
  )
}
