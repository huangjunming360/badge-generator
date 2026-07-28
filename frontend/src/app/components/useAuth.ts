import { useState, useEffect } from "react";
import { fetchCurrentUser, logout as apiLogout, type UserInfo } from "../../api/sessions";

let cached: { user: UserInfo | null } | null = null;

export function useAuth() {
  const [state, setState] = useState<{ user: UserInfo | null; loading: boolean }>(() => ({
    user: cached?.user ?? null,
    loading: !cached,
  }));

  useEffect(() => {
    if (cached) return;
    fetchCurrentUser().then(data => {
      cached = data;
      setState({ user: data.user, loading: false });
    }).catch(() => {
      setState({ user: null, loading: false });
    });
  }, []);

  const logout = async () => {
    await apiLogout();
    cached = null;
    setState({ user: null, loading: false });
  };

  return { ...state, logout };
}
