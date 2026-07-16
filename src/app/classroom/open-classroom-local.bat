@echo off
setlocal
cd /d "%~dp0..\..\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js or open the hosted GitHub Pages version.
  pause
  exit /b 1
)

echo Starting Kelp Classroom locally...
echo.
echo If the browser does not open automatically, copy the URL printed below.
echo Keep this window open while using the classroom.
echo.

node tools\serve-classroom.mjs --open

echo.
echo The local classroom server stopped.
pause
