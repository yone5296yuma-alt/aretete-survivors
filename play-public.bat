@echo off
setlocal
cd /d "%~dp0"
echo Starting local server...
start "AreTete Survivors Server" cmd /k python "%~dp0tools\nocache_server.py" 8790
timeout /t 2 /nobreak >nul
echo Starting public tunnel (Cloudflare)...
start "AreTete Survivors Public Tunnel" cmd /k ""%~dp0tools\cloudflared.exe" tunnel --url http://localhost:8790"
echo.
echo A new window titled "AreTete Survivors Public Tunnel" will open.
echo Look for a line like:  https://xxxx-xxxx-xxxx.trycloudflare.com
echo That URL works from anywhere (not just this Wi-Fi). Share it to let others play.
echo Keep BOTH windows open while playing. Closing them ends access.
echo.
endlocal
