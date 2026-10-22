@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 server.py
) else (
  python server.py
)
if errorlevel 1 (
  echo.
  echo Ez-Kahoot necessite Python 3.10 ou plus recent.
  echo Installe Python depuis https://www.python.org/downloads/
  pause
)
