"use client";

import type { ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { createTheme, ThemeProvider } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#5978ec", contrastText: "#fff" },
    text: { primary: "#191a1e", secondary: "#636770" },
    background: { default: "#eff0f4" },
  },
  typography: {
    fontFamily: "var(--app-font)",
    button: { textTransform: "none" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: { defaultProps: { disableElevation: true, disableRipple: true } },
    MuiIconButton: { defaultProps: { disableRipple: true } },
  },
});

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  );
}
