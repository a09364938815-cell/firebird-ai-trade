import axios from "axios";
import { translateServerMsg } from "@/i18n";

const lang = () => localStorage.getItem("fb_lang") || "en";
const trFields = (d) => {
  if (!d || typeof d !== "object") return;
  for (const k of ["message", "halt_reason", "detail"]) if (typeof d[k] === "string") d[k] = translateServerMsg(d[k], lang());
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "fb_token";

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (lang() !== "en") {
      if (Array.isArray(res.data)) res.data.forEach(trFields);
      else { trFields(res.data); if (Array.isArray(res.data?.items)) res.data.items.forEach(trFields); }
    }
    return res;
  },
  (err) => {
    if (lang() !== "en") trFields(err.response?.data);
    return Promise.reject(err);
  }
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return translateServerMsg("Something went wrong. Please try again.", lang());
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
