"use client";
import { createTheme, ThemeProvider } from "@mui/material/styles";

const theme = createTheme({
  palette: { mode: "dark", primary: { main: "#e5c477", contrastText: "#17140d" }, secondary: { main: "#b8c7d9" }, background: { default: "#101114", paper: "#191b20" }, text: { primary: "#f3f2ed", secondary: "#a8adb8" }, divider: "rgba(230,226,211,.12)", success: { main: "#76c9a6" } },
  typography: { fontFamily: 'var(--font-roboto), "Noto Sans Thai", Tahoma, sans-serif', button: { textTransform: "none", fontWeight: 600 }, h1: { fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.4 }, h2: { fontSize: "1.65rem", fontWeight: 700 }, h3: { fontSize: "1.2rem", fontWeight: 600 }, body1: { lineHeight: 1.8 } },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 42, paddingInline: 20, borderRadius: 10 } } },
    MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { backgroundImage: "none" } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
    MuiInputBase: { styleOverrides: { input: { background: "transparent", boxShadow: "none", minWidth: 0 } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", minHeight: 52 } } },
    MuiTableCell: { styleOverrides: { head: { color: "#a8adb8", background: "#202329", fontWeight: 600 }, root: { borderColor: "rgba(230,226,211,.1)" } } },
  },
});
export function AurumTheme({ children }: { children: React.ReactNode }) { return <ThemeProvider theme={theme}>{children}</ThemeProvider>; }
