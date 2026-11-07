@echo off
rem Starts the core without a window (WebSocket on port 8765) and, in a second window, the Vite
rem dev server of the UI (http://localhost:5173) with hot reload. Close both windows to stop.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "BUILD=yes"

:args
if "%~1"=="" goto :run
if /i "%~1"=="--no-build" (set "BUILD=" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
goto :fail

:run
call "%~dp0common.bat" :check_java || goto :fail
call "%~dp0common.bat" :check_node || goto :fail
if defined BUILD (
    call "%~dp0common.bat" :step "Compiling the core"
    call "%~dp0common.bat" :build_runtime skip-ui -q || goto :fail
)
call "%~dp0common.bat" :ensure_ui_dependencies || goto :fail

call "%~dp0common.bat" :step "Starting the UI dev server in a new window: open http://localhost:5173"
start "GenSynth UI dev server" /d "%UI_DIR%" cmd /k npm run dev

call "%~dp0common.bat" :step "Starting the core (ws://localhost:8765). Ctrl+C stops it"
pushd "%CORE_DIR%"
java -cp "%RUNTIME_CP%" com.gensynth.core.App
set "EXIT_CODE=%errorlevel%"
popd
call "%~dp0common.bat" :done %EXIT_CODE%
exit /b %EXIT_CODE%

:usage
echo Usage: scripts\windows\run-browser.bat [--no-build]
echo.
echo   --no-build   Start the core compiled last, without compiling
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
