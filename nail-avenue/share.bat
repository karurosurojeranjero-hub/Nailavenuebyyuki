@echo off
title Nail Avenue by Yuki - public link
cd /d "%~dp0"
echo.
echo  Make sure start.bat is already running in another window.
echo  Look for the https://....trycloudflare.com link below - that is the link to send to clients.
echo  (Keep this window open. Closing it turns the public link off.)
echo.
where cloudflared >nul 2>nul
if %errorlevel%==0 ( cloudflared tunnel --url http://localhost:3000 & goto end )
echo  First time: installing the free Cloudflare tunnel tool...
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
echo.
echo  Done. CLOSE this window and double-click share.bat again.
:end
pause
