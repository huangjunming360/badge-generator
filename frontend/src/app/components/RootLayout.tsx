import { useEffect } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import TopBar from "./TopBar";
import { useAuth } from "./useAuth";
import { U } from "./shared";

/** 需要登录才能访问的路由前缀 */
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

  return (
    <div style={{ paddingTop: 48 }}>
      <TopBar />
      <Outlet />
    </div>
  );
}
