import { Box, Typography } from '@mui/material'

export function AzIndexRail({
  letters,
  onPick,
}: {
  letters: string[]
  onPick: (letter: string) => void
}) {
  if (letters.length === 0) return null
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 72,
        alignSelf: 'flex-start',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.15,
        py: 1,
        pr: 0.5,
        pl: 0.25,
      }}
    >
      {letters.map((L) => (
        <Typography
          key={L}
          component="button"
          type="button"
          onClick={() => onPick(L)}
          sx={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.65rem',
            fontWeight: 700,
            color: 'primary.main',
            lineHeight: 1.2,
            p: 0,
            minWidth: 14,
            '&:active': { opacity: 0.6 },
          }}
        >
          {L}
        </Typography>
      ))}
    </Box>
  )
}
