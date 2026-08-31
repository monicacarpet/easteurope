import { useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "assets/theme";
import themeDark from "assets/theme-dark";
import routes from "routes";
import { useMaterialUIController } from "context";
import { useAuth } from "auth/AuthContext";
import ProtectedRoute from "auth/ProtectedRoute";
import LanguageSwitcher from "components/Platform/LanguageSwitcher";

export default function App() {
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    document.body.setAttribute("dir", "ltr");
  }, []);

  useLayoutEffect(() => {
    const storageKey = `platform-scroll:${pathname}`;
    const saved = Number(sessionStorage.getItem(storageKey) || 0);
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: Number.isFinite(saved) ? saved : 0, left: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      sessionStorage.setItem(storageKey, String(window.scrollY || 0));
    };
  }, [pathname]);

  const getRoutes = (allRoutes) =>
    allRoutes.map((route) => {
      if (!route.route) return null;
      const element = route.public ? (
        route.component
      ) : (
        <ProtectedRoute roles={route.roles}>{route.component}</ProtectedRoute>
      );
      return <Route path={route.route} element={element} key={route.key} />;
    });

  return (
    <ThemeProvider theme={darkMode ? themeDark : theme}>
      <CssBaseline />
      {!isAuthenticated ? <LanguageSwitcher /> : null}
      <Routes>
        {getRoutes(routes)}
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated ? "/dashboard" : "/authentication/sign-in"} replace />
          }
        />
        <Route
          path="*"
          element={
            <Navigate to={isAuthenticated ? "/dashboard" : "/authentication/sign-in"} replace />
          }
        />
      </Routes>
    </ThemeProvider>
  );
}
