@echo off
title DRISHTIYANA - Install Local Development Root CA
echo ========================================================
echo   DRISHTIYANA - Local Development HTTPS Root CA Setup
echo ========================================================
echo.

set "MKCERT_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe"

if not exist "%MKCERT_EXE%" (
    where mkcert >nul 2>&1
    if %errorlevel% equ 0 (
        set "MKCERT_EXE=mkcert"
    ) else (
        echo [ERROR] mkcert.exe not found!
        echo Please install mkcert via winget:
        echo   winget install FiloSottile.mkcert
        pause
        exit /b 1
    )
)

echo [1/3] Found mkcert binary: %MKCERT_EXE%
echo [2/3] Installing Root CA into Windows Trusted Root store...
echo       (If a Windows Security Warning dialog appears, click YES to trust the local CA)
echo.

"%MKCERT_EXE%" -install

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install local CA into Windows store.
    pause
    exit /b 1
)

echo.
echo [3/3] Generating local HTTPS certificates for LAN & localhost...
cd /d "%~dp0"
node generate-cert.js

echo.
echo ========================================================
echo  SUCCESS! Local CA is installed into Windows Trust Store.
echo  Chrome, Edge, and curl will now trust https://localhost:3001
echo  and https://^<LAN-IP^>:3001 without any "Not Secure" warning!
echo ========================================================
pause
