import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { I18nProvider } from "@/i18n";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Charts from "@/pages/Charts";
import Signals from "@/pages/Signals";
import AutoTrade from "@/pages/AutoTrade";
import ManualTrade from "@/pages/ManualTrade";
import Scanner from "@/pages/Scanner";
import Backtest from "@/pages/Backtest";
import Positions from "@/pages/Positions";
import NFT from "@/pages/NFT";
import Assistant from "@/pages/Assistant";
import Settings from "@/pages/Settings";
import Guide from "@/pages/Guide";
import OwnerPanel from "@/pages/OwnerPanel";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-center" theme="dark" richColors />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="charts" element={<Charts />} />
              <Route path="signals" element={<Signals />} />
              <Route path="auto-trade" element={<AutoTrade />} />
              <Route path="manual" element={<ManualTrade />} />
              <Route path="scanner" element={<Scanner />} />
              <Route path="backtest" element={<Backtest />} />
              <Route path="positions" element={<Positions />} />
              <Route path="nft" element={<NFT />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="settings" element={<Settings />} />
              <Route path="guide" element={<Guide />} />
              <Route path="owner" element={<OwnerPanel />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
