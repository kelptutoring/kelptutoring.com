@echo off
setlocal
cd /d "%~dp0..\..\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js or open the hosted GitHub Pages version.
  pause
  exit /b 1
)

echo Starting Kelp Whiteboard locally...
echo.
echo If the browser does not open automatically, copy the URL printed below.
echo Keep this window open while using the whiteboard.
echo.

node tools\serve-whiteboard.mjs --open

echo.
echo The local whiteboard server stopped.
pause
