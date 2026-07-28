import { useEffect } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./useAuth";

const PROTECTED = ["/design", "/history"];

export default function RootLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (loading) return;
    const needsAuth = PROTECTED.some(p => loc.pathname.startsWith(p));
    if (needsAuth && !user) {
      nav("/login", { replace: true });
    }
  }, [loading, user, loc.pathname]);

  return <Outlet />;
}
