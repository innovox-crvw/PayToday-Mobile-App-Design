/**
 * Demo wallet helpers. Guest preview balance; signed-in users load `/api/wallet/balance`.
 */

/** Shown on wallet overview when the visitor is not signed in. */
export const WALLET_BALANCE_CENTS = 14355

export function formatNad(cents: number): string {
  const n = cents / 100
  const sign = n < 0 ? '-' : ''
  return `${sign}N$ ${Math.abs(n).toFixed(2)}`
}

export interface SavedCard {
  id: string
  nickname: string
  brand: 'visa' | 'mastercard'
  last4: string
  expiryDisplay: string
}

export const MOCK_CARDS: SavedCard[] = [
  { id: 'c1', nickname: 'Card Nickname 1', brand: 'visa', last4: '5145', expiryDisplay: '••/••' },
  { id: 'c2', nickname: 'Card Nickname 2', brand: 'visa', last4: '8891', expiryDisplay: '••/••' },
]

export interface BankDetails {
  accountName: string
  bankName: string
  accountNumber: string
}

export const MOCK_BANK: BankDetails = {
  accountName: "John's Cheque Account",
  bankName: 'Nedbank',
  accountNumber: '0752543741',
}

export type TxSource = 'card' | 'wallet'
export type TxStatus = 'successful' | 'failed' | 'pending'

export interface WalletTransaction {
  id: string
  business: string
  status: TxStatus
  reference: string
  date: string
  datetime: string
  amountCents: number
  type: string
  source: TxSource
  /** How the customer paid (for QA / receipts). */
  paymentMethod: string
  contact?: string
  reason?: string
  /** Raw `dbo.orders.status` when the row comes from the store orders API. */
  orderStatus?: string
}

export const MOCK_TRANSACTIONS: WalletTransaction[] = [
  {
    id: 't1',
    business: 'Maerua Mall Parking',
    status: 'successful',
    reference: 'PT-2024-001',
    date: '12 Mar 2024',
    datetime: '12 Mar 2024, 14:32',
    amountCents: -1000,
    type: 'Purchase',
    source: 'wallet',
    paymentMethod: 'PayToday Wallet',
    contact: '+264 81 000 0000',
  },
  {
    id: 't2',
    business: 'Grove Mall',
    status: 'failed',
    reference: 'PT-2024-002',
    date: '10 Mar 2024',
    datetime: '10 Mar 2024, 09:15',
    amountCents: -2500,
    type: 'Purchase',
    source: 'card',
    paymentMethod: 'Visa ·••• 5145',
    contact: '+264 81 000 0000',
    reason: 'Card Expired',
  },
  {
    id: 't3',
    business: 'Wallet top-up',
    status: 'successful',
    reference: 'PT-2024-003',
    date: '08 Mar 2024',
    datetime: '08 Mar 2024, 11:00',
    amountCents: 5000,
    type: 'Top-up',
    source: 'wallet',
    paymentMethod: 'EFT from Nedbank ·•••741',
  },
  {
    id: 't4',
    business: 'MTC Namibia',
    status: 'successful',
    reference: 'PT-2024-004',
    date: '05 Mar 2024',
    datetime: '05 Mar 2024, 16:45',
    amountCents: -15000,
    type: 'Purchase',
    source: 'card',
    paymentMethod: 'Mastercard ·••• 8891',
    contact: '+264 85 000 0000',
  },
  {
    id: 't5',
    business: 'City of Windhoek — prepaid electricity',
    status: 'successful',
    reference: 'PT-2024-005',
    date: '03 Mar 2024',
    datetime: '03 Mar 2024, 08:05',
    amountCents: -8000,
    type: 'Purchase',
    source: 'wallet',
    paymentMethod: 'Wallet · meter 4711…82',
  },
]

export const NAMIBIAN_BANKS = ['Nedbank', 'FNB Namibia', 'Standard Bank', 'Bank Windhoek', 'Absa']
