@echo off
setlocal
cd /d "%~dp0"
echo Starting Are Tete Survivors server...
start "AreTete Survivors Server" cmd /k python "%~dp0tools\nocache_server.py" 8790

for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-lan-ip.ps1"') do set LANIP=%%i

timeout /t 2 /nobreak >nul
echo.
echo ============================================================
echo   PC   : http://localhost:8790
if defined LANIP (
  echo   Phone (same Wi-Fi only): http://%LANIP%:8790
) else (
  echo   Could not detect LAN IP automatically. Run ipconfig manually.
)
echo ============================================================
echo.
start "" http://localhost:8790
endlocal
