@echo off
title Nail Avenue by Yuki - server
cd /d "%~dp0"
where node >nul 2>nul || (echo.& echo Node.js is not installed. Get the LTS version from https://nodejs.org then run this again.& pause & exit /b 1)
start "" http://localhost:3000
node server.js
pause
