@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_custom_pack.ps1" %*
exit /b %ERRORLEVEL%
