---
name: dev-servers
description: Start or stop the wotoEAT local dev servers (FastAPI backend + Expo) for testing in a browser or on a physical phone. Use when asked to "run the app", "launch it", "let me view it on my phone", or "stop the servers".
---

## Start

1. Backend (from `wotoeat-api/`, needs `.env` present):
   ```
   venv/bin/uvicorn main:app --reload --port 8000
   ```
   Run in the background. Confirm with `curl -s http://localhost:8000/`.
2. Frontend (from `wotoeat-app/`):
   - Browser testing: `npx expo start --web` in the background.
   - Phone testing: get the LAN IP first (`ipconfig getifaddr en0`), make sure
     `wotoeat-app/.env` has `EXPO_PUBLIC_API_URL=http://<LAN_IP>:8000`
     (localhost is unreachable from the phone), then `npx expo start` and tell
     the user to scan the QR code in Expo Go, or open
     `http://<LAN_IP>:8081` in the phone browser. If you changed `.env`,
     restart Metro; env values are read at bundle time.
3. Report the exact URLs: web local, web LAN, and API health check.

## Stop

Kill only this project's processes, nothing broader:
```
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "expo start" 2>/dev/null
```
Confirm both ports are free: `lsof -i :8000 -i :8081 | grep LISTEN` returns
nothing.

## Notes

- If `.env` was pointed at the LAN IP for phone testing, offer to point it
  back to `http://localhost:8000` when stopping.
- If the backend 503s on generation, check the Groq daily token limit before
  debugging code.
- Leave servers running at the end of the session if the user is still
  viewing the app; never kill them implicitly.
