import { useState, useEffect } from "react";
import { fetchCurrentUser, logout as apiLogout, type UserInfo } from "../../api/sessions";

// 单次认证 Promise：多个组件同时首次调用时只发一个请求
let fetchPromise: Promise<{ user: UserInfo | null }> | null = null;
let cachedUser: UserInfo | null | undefined;
const AUTH_CHANGED = "badge-auth-changed";

export function setAuthenticatedUser(user: UserInfo | null) {
  cachedUser = user;
  fetchPromise = Promise.resolve({ user });
  window.dispatchEvent(new CustomEvent<UserInfo | null>(AUTH_CHANGED, { detail: user }));
}

export function useAuth() {
  const [state, setState] = useState<{ user: UserInfo | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;

    const applyUser = (user: UserInfo | null) => {
      if (alive) setState({ user, loading: false });
    };
    const onAuthChanged = (event: Event) => applyUser((event as CustomEvent<UserInfo | null>).detail);
    window.addEventListener(AUTH_CHANGED, onAuthChanged);

    if (cachedUser !== undefined) {
      applyUser(cachedUser);
      return () => {
        alive = false;
        window.removeEventListener(AUTH_CHANGED, onAuthChanged);
      };
    }

    if (!fetchPromise) {
      fetchPromise = fetchCurrentUser();
    }

    fetchPromise.then(data => {
      cachedUser = data.user;
      applyUser(data.user);
    }).catch(() => {
      cachedUser = null;
      applyUser(null);
    });

    return () => {
      alive = false;
      window.removeEventListener(AUTH_CHANGED, onAuthChanged);
    };
  }, []);

  const logout = async () => {
    await apiLogout();
    setAuthenticatedUser(null);
  };

  return { ...state, logout };
}
