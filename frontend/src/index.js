import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { Web3Provider } from "@/web3/Web3Provider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

document.documentElement.classList.add("dark");
document.documentElement.dataset.font = localStorage.getItem("fb_font") || "medium";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <QueryClientProvider client={queryClient}>
    <Web3Provider>
      <App />
    </Web3Provider>
  </QueryClientProvider>,
);
