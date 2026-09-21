@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-harmonia.ps1" %*
if errorlevel 1 (
  echo.
  echo Harmonia could not start. Read the message above before trying again.
  if "%~1"=="" pause
  exit /b 1
)
