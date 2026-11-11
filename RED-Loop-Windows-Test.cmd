@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-chat-test.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo RED LOOP konnte nicht vorbereitet werden. Bitte die Meldung oben pruefen.
)
echo.
pause
exit /b %RESULT%
