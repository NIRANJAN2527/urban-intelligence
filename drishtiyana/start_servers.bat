@echo off
title DRISHTIYANA - Server Launcher
echo ========================================================
echo        DRISHTIYANA SMART CITY BUS SENSING PLATFORM
echo               Starting All System Servers
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting Edge AI Microservice (Port 5001)...
start "DRISHTIYANA Edge AI (Port 5001)" cmd /k "cd /d "%~dp0edge_ai" && python edge_service.py"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Node.js WebRTC & Signaling Server (Ports 3000 & 3001)...
start "DRISHTIYANA Node Server (Ports 3000 & 3001)" cmd /k "cd /d "%~dp0server" && node server.js"

echo.
echo ========================================================
echo All DRISHTIYANA servers are running in separate windows!
echo - Admin Portal : http://localhost:3000/admin
echo - Laptop Viewer: http://localhost:3000/viewer
echo - Phone Stream : Check Node.js terminal for mobile HTTPS URL
echo ========================================================
pause
