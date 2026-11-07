@echo off
rem Compiles and starts the desktop application from the sources. Any other argument (such as a
rem .gsynth file to open) is passed to the application.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "BUILD_ARGS="
set "BUILD=yes"
set "APP_ARGS="

:args
if "%~1"=="" goto :run
if /i "%~1"=="--skip-ui" (set "BUILD_ARGS=skip-ui" & shift & goto :args)
if /i "%~1"=="--no-build" (set "BUILD=" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
rem The application starts in core\: a file is passed with its absolute path (not in a block:
rem a path such as C:\Program Files (x86) would end it)
if exist "%~1" goto :file_arg
set APP_ARGS=%APP_ARGS% %1
shift
goto :args
:file_arg
set APP_ARGS=%APP_ARGS% "%~f1"
shift
goto :args

:run
call "%~dp0common.bat" :check_java || goto :fail
if defined BUILD (
    if not defined BUILD_ARGS (call "%~dp0common.bat" :check_node || goto :fail)
    call "%~dp0common.bat" :step "Compiling"
    call "%~dp0common.bat" :build_runtime %BUILD_ARGS% -q || goto :fail
)
if not exist "%CORE_DIR%\src\main\resources\ui" echo Warning: The UI has not been built yet: run without --skip-ui once.

set "JAVA_OPTS="
call "%~dp0common.bat" :is_jetbrains_runtime
if not errorlevel 1 (
    rem The JetBrains Runtime has its own jcef module, which must be replaced by the library's
    for %%J in ("%CORE_DIR%\%DEV_LIB%\jcef-api-*.jar") do set JAVA_OPTS=--patch-module "jcef=%%~fJ"
)

call "%~dp0common.bat" :step "Starting the desktop application (the first start downloads the embedded browser)"
pushd "%CORE_DIR%"
java %JAVA_OPTS% -cp "%RUNTIME_CP%" com.gensynth.core.App --desktop %APP_ARGS%
set "EXIT_CODE=%errorlevel%"
popd
call "%~dp0common.bat" :done %EXIT_CODE%
exit /b %EXIT_CODE%

:usage
echo Usage: scripts\windows\run-desktop.bat [--skip-ui] [--no-build] [file.gsynth]
echo.
echo   --skip-ui    Keep the React UI already built instead of building it again
echo   --no-build   Start what was compiled last, without compiling
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
