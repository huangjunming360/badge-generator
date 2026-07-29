import { useEffect, useState } from "react";
import { useNavigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./useAuth";
import { getJson } from "../../api/client";

const PROTECTED = ["/design", "/history", "/change-password"];
const PUBLIC = ["/login", "/register", "/setup", "/inactive"];

export default function RootLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [setupChecked, setSetupChecked] = useState(false);

  // 首次加载检查是否需要初始设置
  useEffect(() => {
    getJson<{ needs_setup: boolean }>("/setup").then(d => {
      setSetupChecked(true);
      if (d.needs_setup && loc.pathname !== "/setup") {
        nav("/setup", { replace: true });
      }
    }).catch(() => setSetupChecked(true));
  }, []);

  // 登录/权限检查（公共页面跳过）
  useEffect(() => {
    if (loading || !setupChecked) return;
    if (PUBLIC.some(p => loc.pathname.startsWith(p))) return;
    if (PROTECTED.some(p => loc.pathname.startsWith(p)) && !user) {
      nav("/login", { replace: true });
    }
  }, [loading, user, loc.pathname, setupChecked]);

  return <Outlet />;
}
