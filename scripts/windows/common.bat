@echo off
rem Shared helpers of the GenSynth development scripts for Windows (cmd.exe, no PowerShell).
rem Called by the other scripts as:  call "%~dp0common.bat" :label [arguments]
rem The variables set here (REPO_ROOT, CORE_DIR...) stay in the caller, which uses setlocal.
call %*
exit /b %errorlevel%

:init
for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
set "CORE_DIR=%REPO_ROOT%\core"
set "UI_DIR=%REPO_ROOT%\ui"
set "MIN_JAVA=21"
set "MIN_NODE=20"
rem Runtime libraries of the core, copied on every build so a stale or missing folder never
rem breaks a run (VS Code may rebuild core\target on its own)
set "DEV_LIB=target\dev-lib"
rem Classpath of the core, relative to core\ (where the application must start in development)
set "RUNTIME_CP=target\classes;..\plugin-api\target\classes;..\connectors\rabbitmq\target\classes;target\dev-lib\*"
exit /b 0

:step
echo.
echo ==^> %~1
exit /b 0

:check_java
where java >nul 2>nul || (echo Error: Java was not found. Install JDK %MIN_JAVA% or newer: https://adoptium.net/temurin/releases/?version=%MIN_JAVA%& exit /b 1)
where javac >nul 2>nul || (echo Error: javac was not found: a JRE is not enough, install JDK %MIN_JAVA% or newer: https://adoptium.net/temurin/releases/?version=%MIN_JAVA%& exit /b 1)
set "JAVA_VERSION="
set "JAVA_MAJOR="
for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i /c:" version "') do set "JAVA_VERSION=%%~v"
rem 1.8.0 -> 8, 21.0.5 -> 21
for /f "tokens=1,2 delims=.-+" %%a in ("%JAVA_VERSION%") do (
    set "JAVA_MAJOR=%%a"
    if "%%a"=="1" set "JAVA_MAJOR=%%b"
)
if not defined JAVA_MAJOR (echo Warning: Could not read the Java version; JDK %MIN_JAVA% or newer is needed.& exit /b 0)
if %JAVA_MAJOR% LSS %MIN_JAVA% (echo Error: Java %JAVA_MAJOR% found, but JDK %MIN_JAVA% or newer is needed: https://adoptium.net/temurin/releases/?version=%MIN_JAVA%& exit /b 1)
exit /b 0

:check_node
where node >nul 2>nul || (echo Error: Node.js was not found. Install Node.js %MIN_NODE% or newer ^(https://nodejs.org^), or use --skip-ui.& exit /b 1)
where npm >nul 2>nul || (echo Error: npm was not found. Install Node.js %MIN_NODE% or newer ^(https://nodejs.org^), or use --skip-ui.& exit /b 1)
set "NODE_MAJOR="
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS %MIN_NODE% (echo Error: Node.js %NODE_MAJOR% found, but %MIN_NODE% or newer is needed ^(https://nodejs.org^), or use --skip-ui.& exit /b 1)
exit /b 0

:mvnw
rem Runs the Maven wrapper of the repository (never a global mvn), from the repository root
pushd "%REPO_ROOT%"
call mvnw.cmd %*
set "MVNW_EXIT=%errorlevel%"
popd
exit /b %MVNW_EXIT%

:ensure_ui_dependencies
if exist "%UI_DIR%\node_modules" exit /b 0
call :step "Installing the UI dependencies (npm ci)"
pushd "%UI_DIR%"
call npm ci
set "NPM_EXIT=%errorlevel%"
popd
exit /b %NPM_EXIT%

:build_runtime
rem Compiles every module and copies the runtime libraries of the core to core\target\dev-lib.
rem Arguments: "clean" to start from scratch, "skip-ui" to keep the UI bundle already built,
rem then any extra Maven option.
set "BUILD_GOALS="
set "BUILD_OPTIONS="
:build_runtime_args
if "%~1"=="" goto :build_runtime_run
if /i "%~1"=="clean" (
    set "BUILD_GOALS=clean"
) else if /i "%~1"=="skip-ui" (
    set "BUILD_OPTIONS=%BUILD_OPTIONS% -DskipUi=true"
) else (
    set "BUILD_OPTIONS=%BUILD_OPTIONS% %~1"
)
shift
goto :build_runtime_args
:build_runtime_run
if exist "%CORE_DIR%\%DEV_LIB%" rd /s /q "%CORE_DIR%\%DEV_LIB%"
rem The modules of this repository (plugin API, RabbitMQ) go on the classpath as their compiled
rem classes, so the libraries copied are only the external ones
call :mvnw -B %BUILD_GOALS% compile dependency:copy-dependencies %BUILD_OPTIONS% -DincludeScope=runtime -DexcludeGroupIds=com.gensynth -DoutputDirectory=%DEV_LIB%
exit /b %errorlevel%

:is_jetbrains_runtime
rem errorlevel 0 when the running Java is the JetBrains Runtime, which bundles its own JCEF module
java -version 2>&1 | findstr /i "jbr jetbrains" >nul
exit /b %errorlevel%

:done
rem Ends a script with the exit code in %1. A script opened with a double click runs in its own
rem window, which would close at once: it waits for a key first (GENSYNTH_NO_PAUSE=1 skips it).
if defined GENSYNTH_NO_PAUSE exit /b %~1
echo %CMDCMDLINE% | find /i "%SCRIPT_NAME%" >nul && (echo. & pause)
exit /b %~1
