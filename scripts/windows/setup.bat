@echo off
rem Prepares a fresh clone for development: checks the tools, installs the UI dependencies,
rem builds and installs every module (plugin API, RabbitMQ, core with the UI and the private
rem plugins when present) and leaves the core ready to run.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
rem Kept now: shift also moves %0, so %~dp0 is no longer this folder after reading the options
set "COMMON=%~dp0common.bat"
call "%COMMON%" :init
set "SKIP_UI="
if not "%~1"=="" goto :args
call "%COMMON%" :ask_yes_no "Build the user interface too (needs Node.js)" Y
if "%ANSWER%"=="no" (
    set "SKIP_UI=yes"
    call "%COMMON%" :show_command scripts\windows\setup.bat --skip-ui
) else (
    call "%COMMON%" :show_command scripts\windows\setup.bat
)
goto :run

:args
if "%~1"=="" goto :run
if /i "%~1"=="--skip-ui" (set "SKIP_UI=yes" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
goto :fail

:run
call "%COMMON%" :step "Checking the tools"
call "%COMMON%" :check_java || goto :fail
echo Java %JAVA_MAJOR%
if not defined SKIP_UI (
    call "%COMMON%" :check_node || goto :fail
    node --version
)

if not defined SKIP_UI (
    call "%COMMON%" :step "Installing the UI dependencies (npm ci)"
    pushd "%UI_DIR%"
    call npm ci || (popd & goto :fail)
    popd
)

call "%COMMON%" :step "Building and installing every module (mvnw clean install -DskipTests)"
if defined SKIP_UI (
    call "%COMMON%" :mvnw -B clean install -DskipTests -DskipUi=true || goto :fail
) else (
    call "%COMMON%" :mvnw -B clean install -DskipTests || goto :fail
)

call "%COMMON%" :step "Preparing the core to run from the sources"
call "%COMMON%" :build_runtime skip-ui || goto :fail

echo.
echo GenSynth is ready for development.
echo.
echo Next steps (start them without options to be asked what to do):
echo   scripts\windows\run-desktop.bat     desktop application
echo   scripts\windows\run-cli.bat         gensynth command line
echo   scripts\windows\run-browser.bat     core + UI dev server with hot reload (http://localhost:5173)
echo   scripts\windows\test.bat            backend and frontend tests, as the CI runs them
echo   scripts\windows\compile.bat         compile after changing the code
call "%COMMON%" :done 0
exit /b 0

:usage
echo Usage: scripts\windows\setup.bat [--skip-ui]
echo.
echo   --skip-ui   Do not build the React UI (no Node.js needed); the desktop window will not work
echo.
echo Without options it asks what to do.
exit /b 0

:fail
call "%COMMON%" :done 1
exit /b 1
