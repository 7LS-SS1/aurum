"use client";
import { createTheme, ThemeProvider } from "@mui/material/styles";

// Black & gold dark, flat theme: near-black surfaces,
// thin borders, one gold accent, small radii, no elevation.
const theme = createTheme({
  palette: { mode: "dark", primary: { main: "#d4af37", dark: "#b8942a", contrastText: "#16120a" }, secondary: { main: "#a8a39a" }, background: { default: "#0a0a0b", paper: "#141415" }, text: { primary: "#f2efe8", secondary: "#a8a39a" }, divider: "#2a2826", success: { main: "#4cc985" }, error: { main: "#ff6b5e" }, warning: { main: "#e8a33d" } },
  typography: { fontFamily: 'var(--font-thai), var(--font-roboto), Tahoma, sans-serif', button: { textTransform: "none", fontWeight: 600, fontStretch: "87.5%" }, h1: { fontSize: "1.9rem", fontWeight: 800, lineHeight: 1.2, fontStretch: "75%" }, h2: { fontSize: "1.5rem", fontWeight: 700, fontStretch: "75%" }, h3: { fontSize: "1.15rem", fontWeight: 700, fontStretch: "75%" }, body1: { lineHeight: 1.7 } },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 38, paddingInline: 16, borderRadius: 6 } } },
    MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { backgroundImage: "none", borderRadius: 8 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
    MuiInputBase: { styleOverrides: { input: { background: "transparent", boxShadow: "none", minWidth: 0 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 6, background: "#101011" } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", minHeight: 48 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 999 } } },
    MuiTableCell: { styleOverrides: { head: { color: "#a8a39a", background: "#1c1c1e", fontWeight: 500, fontSize: 12 }, root: { borderColor: "#2a2826" } } },
  },
});
export function AurumTheme({ children }: { children: React.ReactNode }) { return <ThemeProvider theme={theme}>{children}</ThemeProvider>; }
