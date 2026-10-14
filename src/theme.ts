import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#215b58" },
    secondary: { main: "#c36b37" },
    background: { default: "#f3f6f8", paper: "#ffffff" },
    text: { primary: "#203b4b", secondary: "#617684" },
  },
  typography: {
    fontFamily: '"Segoe UI", Roboto, Arial, sans-serif',
    h1: {
      fontSize: "clamp(2rem, 4vw, 3.5rem)",
      fontWeight: 750,
      letterSpacing: "-.04em",
    },
    h2: { fontSize: "1.4rem", fontWeight: 700 },
    h3: { fontSize: "1.1rem", fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiPaper: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { borderColor: "#dce5eb" } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
    MuiMenu: {
      styleOverrides: {
        paper: { maxHeight: "min(240px, calc(100dvh - 32px))" },
      },
    },
    MuiMenuItem: {
      styleOverrides: { root: { minHeight: "36px !important" } },
    },
    MuiAutocomplete: {
      styleOverrides: {
        listbox: { maxHeight: "min(240px, calc(100dvh - 32px))" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, background: "#f3f6f8", whiteSpace: "nowrap" },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollBehavior: "smooth" },
        body: { margin: 0 },
        "#root": { minHeight: "100vh" },
        a: { color: "inherit" },
      },
    },
  },
});
