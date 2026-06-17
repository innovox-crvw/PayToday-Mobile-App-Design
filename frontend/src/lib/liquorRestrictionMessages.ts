/** Signed-in customer with DOB indicating under 18. */
export function liquorBlockedMinorMessage(): string {
  return 'You must be 18 or older to view or buy alcohol. Your account shows you are under 18. If that is a mistake, update your date of birth under My account.'
}

/** Guest or account without verified age for liquor. */
export function liquorBlockedGuestMessage(): string {
  return 'Age-restricted: alcoholic products are only available when you are signed in and your profile shows you are 18 or older. Add your date of birth under My account after signing in.'
}

export function liquorBlockedShortTitle(): string {
  return 'Alcohol not available'
}
