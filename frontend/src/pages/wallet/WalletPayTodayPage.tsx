import { useLocation } from 'react-router-dom'
import AddCardIcon from '@mui/icons-material/AddCard'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined'
import { APP_DISPLAY_NAME, APP_WALLET_DISPLAY_NAME } from '../../theme/branding'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletNavList } from '../../components/wallet/WalletNavList'

const actions = [
  { key: 'fund', label: 'Fund My Wallet', sub: 'Add money from a card or bank', icon: <AddCardIcon /> },
  { key: 'transfer', label: 'Transfer My Wallet', sub: `Send to another ${APP_DISPLAY_NAME} user`, icon: <SwapHorizIcon /> },
  { key: 'withdraw', label: 'Withdraw to Bank Account', sub: 'Move balance to your linked account', icon: <AccountBalanceIcon /> },
] as const

export function WalletPayTodayPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'

  return (
    <WalletPageShell
      variant="sub"
      title={APP_WALLET_DISPLAY_NAME}
      subtitle="Manage how you add, move, or withdraw your wallet balance."
      showBack
    >
      <WalletNavList
        groups={[
          {
            items: actions.map((a) => ({
              to: `${prefix}/paytoday/${a.key}`,
              label: a.label,
              secondary: a.sub,
              icon: a.icon,
            })),
          },
          {
            items: [
              {
                to: `${prefix}/savings`,
                label: 'Savings pocket',
                secondary: 'Round-up spare change from PayToday Wallet purchases',
                icon: <SavingsOutlinedIcon />,
              },
            ],
          },
        ]}
      />
    </WalletPageShell>
  )
}
