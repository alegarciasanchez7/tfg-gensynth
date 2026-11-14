@echo off
rem Compiles every module and leaves the core ready to run (no tests, no packages).
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
rem Kept now: shift also moves %0, so %~dp0 is no longer this folder after reading the options
set "COMMON=%~dp0common.bat"
call "%COMMON%" :init
set "BUILD_ARGS="
if not "%~1"=="" goto :args
call "%COMMON%" :ask_yes_no "Build the user interface too" Y
if "%ANSWER%"=="no" (
    set "BUILD_ARGS=skip-ui"
    call "%COMMON%" :show_command scripts\windows\compile.bat --skip-ui
) else (
    call "%COMMON%" :show_command scripts\windows\compile.bat
)
goto :run

:args
if "%~1"=="" goto :run
if /i "%~1"=="--skip-ui" (set "BUILD_ARGS=skip-ui" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
echo Error: Unknown option: %~1
call :usage_text
goto :fail

:run
call "%COMMON%" :check_java || goto :fail
if not defined BUILD_ARGS (call "%COMMON%" :check_node || goto :fail)
call "%COMMON%" :step "Compiling"
call "%COMMON%" :build_runtime %BUILD_ARGS% || goto :fail
echo Compiled.
call "%COMMON%" :done 0
exit /b 0

:usage
call :usage_text
exit /b 0

:usage_text
echo Usage: scripts\windows\compile.bat [--skip-ui]
echo.
echo   --skip-ui   Keep the React UI already built instead of building it again
echo.
echo Without options it asks what to do.
exit /b 0

:fail
call "%COMMON%" :done 1
exit /b 1
