/** Payload sent to checkout when a Yango demo slot is chosen. */
export type YangoDemoSchedulePayload = {
  deliveryScheduledFor: string
  homeWinStart: string
  homeWinEnd: string
  homeWinLabel: string
  /** Illustrative Yango courier fee for the selected demo zone (not added to cart total). */
  demoCourierCents: number
}
