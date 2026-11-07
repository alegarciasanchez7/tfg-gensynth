@echo off
rem Runs the same checks as the CI: backend tests with coverage, then the UI lint, type check,
rem tests with coverage and build.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "BACKEND=yes"
set "FRONTEND=yes"

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
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
