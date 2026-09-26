import React, { createContext, useContext, useEffect, useState } from "react";
import api, { setToken, clearToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out, obj = logged in
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => setUser((prev) => (prev && prev.id ? prev : r.data)))
      .catch(() => {
        clearToken();
        setUser((prev) => (prev && prev.id ? prev : false));
      })
      .finally(() => setLoading(false));
  }, []);

  const loginUser = (data) => {
    if (data.access_token) setToken(data.access_token);
    setUser(data);
  };

  const value = {
    user,
    loading,
    setUser: loginUser,
    refresh: async () => {
      try {
        const r = await api.get("/auth/me");
        setUser(r.data);
        return r.data;
      } catch {
        setUser(false);
        return false;
      }
    },
    logout: async () => {
      try {
        await api.post("/auth/logout");
      } catch {}
      clearToken();
      setUser(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
