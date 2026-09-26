# Firebird AI Trade — Export Package

This is a copyable snapshot of the Firebird AI Trade web app for testing / handing to another AI.

## Stack
- Frontend: React (JSX) + Tailwind + shadcn/ui  (folder: `frontend/`)
- Backend: FastAPI + MongoDB  (folder: `backend/`)

## Run locally
1. Backend:
   - `cd backend && pip install -r requirements.txt`
   - Set `backend/.env`: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `EMERGENT_LLM_KEY`, `FRONTEND_URL`
   - `uvicorn server:app --host 0.0.0.0 --port 8001`
2. Frontend:
   - `cd frontend && yarn install`
   - Set `frontend/.env`: `REACT_APP_BACKEND_URL=http://localhost:8001`
   - `yarn start`

## Login
See `LOGIN_KEY.txt`. Admin: admin@firebird.ai / Firebird#2026

## NFT Album
`nft_album/` contains the 6 legendary rares + 2 common templates (images + `metadata.json` with stories),
ready as a launch STARTER. Full 555 supply is the next production phase.

## Important (honest scope)
- Demo/sandbox only by default; no real money trading.
- Market data uses public exchange APIs (falls back to labeled simulated data if blocked).
- No guaranteed win rates — backtest stats are historical only.
