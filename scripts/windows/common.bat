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

rem --- Questions ------------------------------------------------------------------------------
rem A script started without options (for example with a double click) asks what to do; with
rem options, as in the CI, it uses them and asks nothing. Texts passed to these labels must not
rem contain the characters %% ^& ^| ^< ^> or ^^.

:ask_yes_no
rem Asks a yes/no question: %1 the question, %2 the default (Y or N). Enter takes the default.
rem Sets ANSWER to yes or no.
set "ASK_DEFAULT=%~2"
set "ASK_HINT=[y/N]"
if /i "%ASK_DEFAULT%"=="Y" set "ASK_HINT=[Y/n]"
:ask_yes_no_again
set "ASK_INPUT="
set /p "ASK_INPUT=%~1? %ASK_HINT% "
if not defined ASK_INPUT set "ASK_INPUT=%ASK_DEFAULT%"
for %%A in (y yes s si) do if /i "%ASK_INPUT%"=="%%A" (set "ANSWER=yes" & exit /b 0)
for %%A in (n no) do if /i "%ASK_INPUT%"=="%%A" (set "ANSWER=no" & exit /b 0)
echo Answer y (yes) or n (no).
goto :ask_yes_no_again

:ask_choice
rem Asks to pick an option by its number: %1 the question, %2 the number of the default option,
rem then the options. Enter takes the default. Sets CHOICE (1, 2...).
echo %~1:
set "ASK_DEFAULT=%~2"
set "ASK_COUNT=0"
shift
shift
:ask_choice_list
if "%~1"=="" goto :ask_choice_read
set /a ASK_COUNT+=1
echo   %ASK_COUNT%) %~1
shift
goto :ask_choice_list
:ask_choice_read
set "ASK_INPUT="
set /p "ASK_INPUT=Choose 1-%ASK_COUNT% [%ASK_DEFAULT%]: "
if not defined ASK_INPUT set "ASK_INPUT=%ASK_DEFAULT%"
set "ASK_VALID="
for /l %%N in (1,1,%ASK_COUNT%) do if "%ASK_INPUT%"=="%%N" set "ASK_VALID=yes"
if defined ASK_VALID (set "CHOICE=%ASK_INPUT%" & exit /b 0)
echo Type a number from 1 to %ASK_COUNT%.
goto :ask_choice_read

:ask_text
rem Asks for a free text: %1 the question. Enter leaves it empty. Sets ANSWER.
set "ANSWER="
set /p "ANSWER=%~1: "
exit /b 0

:show_command
rem After the questions, shows the command that does the same without asking
echo (next time, without questions: %*)
exit /b 0

:check_java
rem The JDK of JAVA_HOME (the one the Maven wrapper uses) goes first on the PATH: installers such
rem as Oracle's put a "javapath" folder with an old Java at the front, ahead of the JDK
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"
call :current_java_major
rem The number is compared on its own line: cmd expands the whole line first, and an empty
rem JAVA_MAJOR would be a syntax error even behind "if defined"
if not defined JAVA_MAJOR goto :check_java_search
if %JAVA_MAJOR% LSS %MIN_JAVA% goto :check_java_search
where javac >nul 2>nul && exit /b 0
:check_java_search
rem No JDK new enough on the PATH nor in JAVA_HOME: look for one in the usual install folders
rem and use it as JAVA_HOME (so the Maven wrapper takes it too), only while the script runs
call :find_jdk
if not defined FOUND_JDK goto :check_java_report
set "JAVA_HOME=%FOUND_JDK%"
set "PATH=%FOUND_JDK%\bin;%PATH%"
echo Using the JDK %FOUND_MAJOR% found in %FOUND_JDK% ^(set JAVA_HOME to choose another one^)
call :current_java_major
exit /b 0
:check_java_report
where java >nul 2>nul || (echo Error: Java was not found. Install JDK %MIN_JAVA% or newer: https://adoptium.net/temurin/releases/?version=%MIN_JAVA%& exit /b 1)
where javac >nul 2>nul || (echo Error: javac was not found: a JRE is not enough, install JDK %MIN_JAVA% or newer: https://adoptium.net/temurin/releases/?version=%MIN_JAVA%& exit /b 1)
if not defined JAVA_MAJOR (echo Warning: Could not read the Java version; JDK %MIN_JAVA% or newer is needed.& exit /b 0)
if %JAVA_MAJOR% LSS %MIN_JAVA% (echo Error: Java %JAVA_MAJOR% found, but JDK %MIN_JAVA% or newer is needed: https://adoptium.net/temurin/releases/?version=%MIN_JAVA% ^(if it is already installed somewhere else, set JAVA_HOME to its folder^)& exit /b 1)
exit /b 0

:current_java_major
rem Sets JAVA_MAJOR to the major version of the java on the PATH (empty when there is none)
set "JAVA_MAJOR="
set "JAVA_VERSION="
where java >nul 2>nul || exit /b 0
for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i /c:" version "') do set "JAVA_VERSION=%%~v"
call :parse_major "%JAVA_VERSION%"
set "JAVA_MAJOR=%PARSED_MAJOR%"
exit /b 0

:parse_major
rem Sets PARSED_MAJOR to the major version in %1: 1.8.0 -> 8, 21.0.5 -> 21 (empty if unreadable)
set "PARSED_MAJOR="
for /f "tokens=1,2 delims=.-+" %%a in ("%~1") do (
    set "PARSED_MAJOR=%%a"
    if "%%a"=="1" set "PARSED_MAJOR=%%b"
)
rem Anything that is not a number (an unexpected format) counts as unreadable
if defined PARSED_MAJOR for /f "delims=0123456789" %%x in ("%PARSED_MAJOR%") do set "PARSED_MAJOR="
exit /b 0

:find_jdk
rem Looks for the oldest JDK %MIN_JAVA% or newer (the closest to the JDK of the CI: a newer one may
rem break tests, as JDK 25 does with Mockito) in the folders where the usual installers put it
rem (Oracle, Adoptium/Temurin, Microsoft, Zulu, Corretto, Liberica, Semeru) and in the ones of
rem IntelliJ IDEA and Scoop. Sets FOUND_JDK (empty when there is none) and FOUND_MAJOR.
set "FOUND_JDK="
set "FOUND_MAJOR="
for %%R in (
    "%ProgramFiles%\Java"
    "%ProgramFiles%\Eclipse Adoptium"
    "%ProgramFiles%\Eclipse Foundation"
    "%ProgramFiles%\Microsoft"
    "%ProgramFiles%\Zulu"
    "%ProgramFiles%\Amazon Corretto"
    "%ProgramFiles%\BellSoft"
    "%ProgramFiles%\Semeru"
    "%ProgramFiles%\IBM\Semeru"
    "%LOCALAPPDATA%\Programs\Eclipse Adoptium"
    "%USERPROFILE%\.jdks"
    "%USERPROFILE%\scoop\apps"
) do if exist "%%~R\" for /d %%D in ("%%~R\*") do call :jdk_candidate "%%~fD"
exit /b 0

:jdk_candidate
rem Keeps %1 in FOUND_JDK when it is a JDK (not a JRE) older than the one found so far. Scoop
rem keeps each JDK in apps\<name>\current. The version comes from the "release" file of the JDK.
set "CANDIDATE=%~1"
if not exist "%CANDIDATE%\bin\javac.exe" if exist "%CANDIDATE%\current\bin\javac.exe" set "CANDIDATE=%CANDIDATE%\current"
if not exist "%CANDIDATE%\bin\javac.exe" exit /b 0
if not exist "%CANDIDATE%\bin\java.exe" exit /b 0
if not exist "%CANDIDATE%\release" exit /b 0
set "CANDIDATE_VERSION="
for /f "usebackq tokens=1,* delims==" %%k in ("%CANDIDATE%\release") do if "%%k"=="JAVA_VERSION" set "CANDIDATE_VERSION=%%~l"
call :parse_major "%CANDIDATE_VERSION%"
if not defined PARSED_MAJOR exit /b 0
if %PARSED_MAJOR% LSS %MIN_JAVA% exit /b 0
if defined FOUND_MAJOR if %PARSED_MAJOR% GEQ %FOUND_MAJOR% exit /b 0
set "FOUND_JDK=%CANDIDATE%"
set "FOUND_MAJOR=%PARSED_MAJOR%"
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
rem By its full path: with NoDefaultCurrentDirectoryInExePath set, cmd skips the current folder
call "%REPO_ROOT%\mvnw.cmd" %*
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

:needs_build
rem errorlevel 0 when the core must be compiled before it can run: its classes or its libraries
rem are missing (after a clean, or when VS Code rebuilt core\target)
if not exist "%CORE_DIR%\target\classes" exit /b 0
if not exist "%CORE_DIR%\%DEV_LIB%" exit /b 0
if not exist "%REPO_ROOT%\plugin-api\target\classes" exit /b 0
exit /b 1

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
