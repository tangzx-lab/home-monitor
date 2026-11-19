@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 18+ from https://nodejs.org/
  goto :failed
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 18 or newer is required. Please update Node.js.
  goto :failed
)
if not exist "front\server.mjs" (
  echo Missing front\server.mjs. Keep this script in the project root.
  goto :failed
)
if not defined PORT set "PORT=5173"
node -e "const p = Number(process.env.PORT); process.exit(Number.isInteger(p) && p >= 1 && p <= 65535 ? 0 : 1)"
if errorlevel 1 (
  echo PORT must be an integer from 1 to 65535.
  goto :failed
)

echo Starting the home monitor service. Press Ctrl+C to stop.
echo Open the URL printed by the server in Chrome or Edge for USB serial.
echo If EADDRINUSE appears, the port is occupied. Set PORT to another port and retry.
node "front\server.mjs"
if errorlevel 1 goto :failed
popd
exit /b 0

:failed
echo Service did not start or stopped with an error. See the message above.
pause
popd
exit /b 1
