import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet, metaMaskWallet, trustWallet, rainbowWallet, walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { mainnet, bsc, polygon, arbitrum, base } from "wagmi/chains";

export const CHAINS = [mainnet, bsc, polygon, arbitrum, base];

// A real WalletConnect/Reown projectId enables QR + mobile wallets.
// Falls back to a demo id so browser-extension (injected) wallets still work.
const envId = (process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || "").trim();
const projectId = envId && !envId.startsWith("[") ? envId : "firebird_demo_projectid_replace_me";

export const HAS_WC_PROJECT_ID = Boolean(envId && !envId.startsWith("["));

// Coinbase Wallet SDK (v4 / @base-org/account) ships ESM that CRA's webpack
// cannot bundle, so it is intentionally excluded. Coinbase Wallet mobile still
// connects through the WalletConnect QR option.
//
// IMPORTANT: WalletConnect-backed wallets boot Reown AppKit, which fetches a
// remote project config. With a placeholder/invalid projectId that fetch 403s
// and its background promise rejects as "A background operation failed" (CRA
// then shows a crash overlay). So we only register WalletConnect wallets when a
// REAL projectId is present; otherwise we expose only the injected (browser
// extension) wallet, which never touches Reown.
const walletList = HAS_WC_PROJECT_ID
  ? [injectedWallet, metaMaskWallet, trustWallet, rainbowWallet, walletConnectWallet]
  : [injectedWallet];

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: walletList,
    },
  ],
  { appName: "FireBird Crypto", projectId },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: CHAINS,
  ssr: false,
  transports: {
    [mainnet.id]: http(),
    [bsc.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
  },
});

export const CHAIN_LABEL = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  42161: "Arbitrum",
  8453: "Base",
};

export const EXPLORER_TX = {
  1: "https://etherscan.io/tx/",
  56: "https://bscscan.com/tx/",
  137: "https://polygonscan.com/tx/",
  42161: "https://arbiscan.io/tx/",
  8453: "https://basescan.org/tx/",
};

// Canonical swap routers used to read/revoke ERC20 allowances for DEX auto-trade.
export const DEX_ROUTERS = {
  1: { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", name: "Uniswap" },
  56: { address: "0x10ED43C718714eb63d5aA57B78B54704E256024E", name: "PancakeSwap" },
  137: { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", name: "Uniswap" },
  42161: { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", name: "Uniswap" },
  8453: { address: "0x2626664c2603336E57B271c5C0b26F421741e481", name: "Uniswap" },
};

// Issuer-verified stablecoin contracts per chain.
export const STABLES = {
  1: {
    USDC: { address: "0xA0b86991c6218c36c1d19d4a2e9Eb0cE3606eB48", decimals: 6 },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  },
  56: {
    USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  },
  137: {
    USDC: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    USDT: { address: "0xc2132D05D31c914a87C6611C10748AaCbC5325E8", decimals: 6 },
  },
  42161: {
    USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
  },
  8453: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  },
};

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
