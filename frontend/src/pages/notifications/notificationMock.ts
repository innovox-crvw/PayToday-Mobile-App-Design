export type NotificationRow = {
  id: string
  title: string
  subtitle: string
  amountCents?: number
  kind: 'payment_request' | 'payment' | 'airtime' | 'electricity' | 'classifieds' | 'generic'
}

export const NOTIFICATIONS_MOCK: NotificationRow[] = [
  {
    id: 'n1',
    title: 'Payment request',
    subtitle: 'Sam Simpson · N$ 300.00',
    amountCents: 300_00,
    kind: 'payment_request',
  },
  {
    id: 'n2',
    title: 'Payment',
    subtitle: 'Le Pain Café · N$ 125.00',
    amountCents: 125_00,
    kind: 'payment',
  },
  {
    id: 'n3',
    title: 'Airtime purchase',
    subtitle: 'MTC · N$ 100.00',
    amountCents: 100_00,
    kind: 'airtime',
  },
  {
    id: 'n4',
    title: 'Electricity purchase',
    subtitle: 'City of Windhoek · N$ 100.00',
    amountCents: 100_00,
    kind: 'electricity',
  },
  {
    id: 'n5',
    title: 'Classifieds message',
    subtitle: 'James May · regarding your ad',
    kind: 'classifieds',
  },
]
