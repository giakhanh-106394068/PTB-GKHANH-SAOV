@echo off
setlocal EnableExtensions
set "PHOTOBOOTH_DIR=%~dp0"
set "PHOTOBOOTH_PORT=4175"
where.exe node.exe >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Khong tim thay Node.js. Hay cai Node.js va mo lai file nay.','SAOV Photobooth') | Out-Null"
  exit /b 1
)
if not exist "%PHOTOBOOTH_DIR%server.mjs" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Khong tim thay server.mjs trong thu muc photobooth.','SAOV Photobooth') | Out-Null"
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PHOTOBOOTH_DIR%start-photobooth.ps1"
endlocal
