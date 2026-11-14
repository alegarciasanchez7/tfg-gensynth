@echo off
rem Compiles and starts the gensynth command line from the sources. The UI is not built: the
rem command line does not use it.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
rem Kept now: shift also moves %0, so %~dp0 is no longer this folder after reading the options
set "COMMON=%~dp0common.bat"
call "%COMMON%" :init
set "JAVA_OPTS="
set "CLI_ARGS="
set "BUILD=yes"
if not "%~1"=="" goto :args
set "COMMAND=scripts\windows\run-cli.bat"
call "%COMMON%" :ask_choice "Which command line" 1 "Full application (with edit, which opens projects in the window)" "CLI edition (as the CLI edition installer: no edit)"
if "%CHOICE%"=="2" (
    set "JAVA_OPTS=-Dgensynth.edition=cli"
    set "COMMAND=%COMMAND% --cli-edition"
)
call "%COMMON%" :ask_yes_no "Compile before starting" Y
if "%ANSWER%"=="no" (
    set "BUILD="
    set "COMMAND=%COMMAND% --no-build"
)
call "%COMMON%" :show_command %COMMAND%
goto :run

:args
if "%~1"=="" goto :run
if /i "%~1"=="--cli-edition" (set "JAVA_OPTS=-Dgensynth.edition=cli" & shift & goto :args)
if /i "%~1"=="--no-build" (set "BUILD=" & shift & goto :args)
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
set CLI_ARGS=%CLI_ARGS% %1
shift
goto :args

:run
call "%COMMON%" :check_java || goto :fail
if defined BUILD goto :build_checked
call "%COMMON%" :needs_build
if errorlevel 1 goto :build_checked
echo Warning: Nothing is compiled yet: compiling first.
set "BUILD=yes"
:build_checked
if defined BUILD (
    call "%COMMON%" :step "Compiling"
    call "%COMMON%" :build_runtime skip-ui -q || goto :fail
)
pushd "%CORE_DIR%"
java %JAVA_OPTS% -cp "%RUNTIME_CP%" com.gensynth.core.cli.CliMain %CLI_ARGS%
set "EXIT_CODE=%errorlevel%"
popd
call "%COMMON%" :done %EXIT_CODE%
exit /b %EXIT_CODE%

:usage
echo Usage: scripts\windows\run-cli.bat [--cli-edition] [--no-build] [--version]
echo.
echo   --cli-edition   Behave like the CLI edition installer (no edit command)
echo   --no-build      Start what was compiled last, without compiling
echo   Other options are passed to gensynth (--version).
echo.
echo Without options it asks what to do.
echo.
echo The command line starts in core\, as the application does from the sources: relative paths
echo typed in it start there (absolute paths and ~ work anywhere).
exit /b 0

:fail
call "%COMMON%" :done 1
exit /b 1
