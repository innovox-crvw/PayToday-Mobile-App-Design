import { alpha, createTheme } from '@mui/material/styles'

const slate900 = '#0f172a'
const slate600 = '#475569'
const slate400 = '#94a3b8'

export const storeTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#3333FF',
    },
    secondary: {
      main: '#8A2BE2',
    },
    text: {
      primary: slate900,
      secondary: slate600,
      disabled: alpha(slate900, 0.38),
    },
    divider: alpha(slate900, 0.09),
    action: {
      active: alpha(slate900, 0.65),
      hover: alpha('#3333FF', 0.06),
      selected: alpha('#3333FF', 0.1),
      disabled: alpha(slate900, 0.28),
      disabledBackground: alpha(slate900, 0.06),
    },
    background: {
      default: '#F6F7FB',
      paper: '#FFFFFF',
    },
  },
  shape: {
    /** Nearly square corners across the store shell. */
    borderRadius: 4,
  },
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1440,
    },
  },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: {
      fontWeight: 800,
      letterSpacing: -0.55,
      lineHeight: 1.15,
      fontSize: '1.65rem',
      '@media (min-width:600px)': { fontSize: '1.9rem' },
      '@media (min-width:900px)': { fontSize: '2.125rem' },
    },
    h2: {
      fontWeight: 750,
      letterSpacing: -0.45,
      lineHeight: 1.2,
      fontSize: '1.45rem',
      '@media (min-width:600px)': { fontSize: '1.65rem' },
      '@media (min-width:900px)': { fontSize: '1.75rem' },
    },
    h3: {
      fontWeight: 750,
      letterSpacing: -0.35,
      lineHeight: 1.22,
      fontSize: '1.25rem',
      '@media (min-width:600px)': { fontSize: '1.4rem' },
      '@media (min-width:900px)': { fontSize: '1.5rem' },
    },
    h4: { fontWeight: 750, letterSpacing: -0.32, lineHeight: 1.25, fontSize: '1.35rem' },
    h5: { fontWeight: 700, letterSpacing: -0.24, lineHeight: 1.3, fontSize: '1.2rem' },
    h6: { fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.35, fontSize: '1.05rem' },
    subtitle1: { fontWeight: 600, letterSpacing: 0.01, lineHeight: 1.45, fontSize: '1rem' },
    subtitle2: { fontWeight: 600, letterSpacing: 0.02, lineHeight: 1.45, fontSize: '0.8125rem' },
    body1: {
      lineHeight: 1.6,
      fontSize: '0.9375rem',
      '@media (min-width:600px)': { fontSize: '1rem' },
    },
    body2: { lineHeight: 1.55, fontSize: '0.875rem' },
    caption: { lineHeight: 1.45, fontSize: '0.75rem', letterSpacing: 0.01 },
    overline: {
      fontWeight: 700,
      letterSpacing: '0.08em',
      fontSize: '0.6875rem',
      lineHeight: 1.5,
      textTransform: 'uppercase',
    },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0.02 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          textRendering: 'optimizeLegibility',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          letterSpacing: 0.02,
          boxShadow: 'none',
          transition: theme.transitions.create(['background-color', 'box-shadow', 'transform'], {
            duration: theme.transitions.duration.shorter,
          }),
        }),
        sizeLarge: {
          paddingTop: 14,
          paddingBottom: 14,
          fontSize: '1rem',
          borderRadius: 4,
        },
        sizeMedium: {
          paddingLeft: 18,
          paddingRight: 18,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: Number(theme.shape.borderRadius),
          border: `1px solid ${alpha(slate900, 0.075)}`,
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
        }),
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          '@media (min-width: 1200px)': {
            paddingLeft: 32,
            paddingRight: 32,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 56,
          '@media (min-width: 600px)': {
            minHeight: 64,
            paddingLeft: 16,
            paddingRight: 16,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 4,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha(theme.palette.primary.main, 0.38),
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
            borderColor: theme.palette.primary.main,
          },
        }),
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          transition: theme.transitions.create(['background-color', 'transform'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.06),
          },
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.14),
            },
          },
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 4,
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          minHeight: 72,
          height: 'auto',
          paddingTop: 4,
          paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -4px 24px rgba(15, 23, 42, 0.06)',
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: ({ theme }) => ({
          paddingTop: 8,
          minWidth: 64,
          color: slate400,
          '&.Mui-selected': {
            color: theme.palette.primary.main,
          },
        }),
        label: {
          fontSize: '0.7rem',
          fontWeight: 600,
          '&.Mui-selected': {
            fontSize: '0.7rem',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: Number(theme.shape.borderRadius),
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.14)',
        }),
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: `${Math.max(2, Number(theme.shape.borderRadius) - 1)}px !important`,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: 'none',
          '&:before': { display: 'none' },
          '&.Mui-expanded': {
            margin: 0,
          },
        }),
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: ({ theme }) => ({
          height: 3,
          borderRadius: 3,
          backgroundColor: theme.palette.primary.main,
        }),
      },
    },
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontWeight: 600,
          textTransform: 'none',
          minHeight: 48,
          transition: theme.transitions.create('color', { duration: theme.transitions.duration.shorter }),
        }),
      },
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          paddingTop: 8,
          paddingBottom: 8,
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: ({ theme }) => ({
          fontWeight: 600,
          '&.Mui-active': { color: theme.palette.primary.main },
          '&.Mui-completed': { color: theme.palette.text.secondary },
        }),
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          backgroundColor: alpha(theme.palette.text.primary, 0.08),
        }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          alignItems: 'center',
          border: `1px solid ${theme.palette.divider}`,
        }),
        standardInfo: ({ theme }) => ({
          borderColor: alpha(theme.palette.primary.main, 0.2),
        }),
        standardSuccess: ({ theme }) => ({
          borderColor: alpha(theme.palette.success.main, 0.25),
        }),
        standardWarning: ({ theme }) => ({
          borderColor: alpha(theme.palette.warning.main, 0.35),
        }),
        standardError: ({ theme }) => ({
          borderColor: alpha(theme.palette.error.main, 0.25),
        }),
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 4,
          fontSize: '0.75rem',
          fontWeight: 600,
          padding: '8px 12px',
          backgroundColor: alpha(slate900, 0.92),
        },
        arrow: {
          color: alpha(slate900, 0.92),
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 2,
          transition: theme.transitions.create(['background-color', 'transform'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&:focus-visible': {
            outline: `2px solid ${alpha(theme.palette.primary.main, 0.45)}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiLink: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&:focus-visible': {
            outline: `2px solid ${alpha(theme.palette.primary.main, 0.45)}`,
            outlineOffset: 2,
            borderRadius: 2,
          },
        }),
      },
    },
  },
})
