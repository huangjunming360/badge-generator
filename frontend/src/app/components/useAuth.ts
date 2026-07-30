import { useState, useEffect } from "react";
import { fetchCurrentUser, logout as apiLogout, type UserInfo } from "../../api/sessions";

// 单次认证 Promise：多个组件同时首次调用时只发一个请求
let fetchPromise: Promise<{ user: UserInfo | null }> | null = null;

export function useAuth() {
  const [state, setState] = useState<{ user: UserInfo | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;

    if (!fetchPromise) {
      fetchPromise = fetchCurrentUser();
    }

    fetchPromise.then(data => {
      if (alive) setState({ user: data.user, loading: false });
    }).catch(() => {
      if (alive) setState({ user: null, loading: false });
    });

    return () => { alive = false; };
  }, []);

  const logout = async () => {
    await apiLogout();
    fetchPromise = null;
    setState({ user: null, loading: false });
  };

  return { ...state, logout };
}
