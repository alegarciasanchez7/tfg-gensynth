@echo off
rem Runs the same checks as the CI: backend tests with coverage, then the UI lint, type check,
rem tests with coverage and build.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "BACKEND=yes"
set "FRONTEND=yes"
if not "%~1"=="" goto :args
call "%~dp0common.bat" :ask_choice "What to check" 1 "Backend and frontend, as the CI" "Backend only (mvnw verify)" "Frontend only (lint, typecheck, tests, build)"
if "%CHOICE%"=="1" call "%~dp0common.bat" :show_command scripts\windows\test.bat
if "%CHOICE%"=="2" set "FRONTEND="
if "%CHOICE%"=="2" call "%~dp0common.bat" :show_command scripts\windows\test.bat --backend
if "%CHOICE%"=="3" set "BACKEND="
if "%CHOICE%"=="3" call "%~dp0common.bat" :show_command scripts\windows\test.bat --frontend
goto :run

:args
if "%~1"=="" goto :run
if /i "%~1"=="--backend" (set "FRONTEND=" & shift & goto :args)
if /i "%~1"=="--frontend" (set "BACKEND=" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
goto :fail

:run
if defined BACKEND (
    call "%~dp0common.bat" :check_java || goto :fail
    call "%~dp0common.bat" :step "Backend: mvnw verify"
    rem The UI is checked by its own steps below
    call "%~dp0common.bat" :mvnw -B verify -DskipUi=true || goto :fail
)
if not defined FRONTEND goto :passed
call "%~dp0common.bat" :check_node || goto :fail
call "%~dp0common.bat" :ensure_ui_dependencies || goto :fail
pushd "%UI_DIR%"
call "%~dp0common.bat" :step "Frontend: lint"
call npm run lint || goto :frontend_failed
call "%~dp0common.bat" :step "Frontend: typecheck"
call npm run typecheck || goto :frontend_failed
call "%~dp0common.bat" :step "Frontend: tests"
call npm run test:coverage || goto :frontend_failed
call "%~dp0common.bat" :step "Frontend: build"
call npm run build || goto :frontend_failed
popd

:passed
echo.
echo All checks passed.
call "%~dp0common.bat" :done 0
exit /b 0

:frontend_failed
popd
goto :fail

:usage
echo Usage: scripts\windows\test.bat [--backend ^| --frontend]
echo.
echo   --backend    Only the Java modules (mvnw verify)
echo   --frontend   Only the UI (lint, typecheck, tests with coverage, build)
echo.
echo Without options it asks what to do.
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
