@echo off
rem Builds the GenSynth installers: the full application and/or the CLI edition, for Windows
rem and/or the other systems. jpackage only builds installers for the OS it runs on, so the .msi
rem files are built here (core\target\installer\dist and dist-cli, with WiX Toolset 3) and the
rem installers of Linux and macOS on GitHub Actions (the Release workflow, which publishes
rem nothing), then downloaded to core\target\installer\remote\. That needs the GitHub CLI (gh)
rem and the branch pushed to GitHub. Start it without options to be asked what to do.
setlocal EnableExtensions
set "SCRIPT_NAME=%~nx0"
call "%~dp0common.bat" :init
set "SYSTEMS=this"
set "OS_SET="
set "EDITION=both"
set "ASKED="
if not "%~1"=="" goto :args

set "ASKED=yes"
call "%~dp0common.bat" :ask_choice "Installers for" 1 "This computer (Windows)" "Linux (built on GitHub Actions)" "macOS (built on GitHub Actions)" "Windows, Linux and macOS (the other two on GitHub Actions)"
if "%CHOICE%"=="2" set "SYSTEMS=linux"
if "%CHOICE%"=="3" set "SYSTEMS=macos"
if "%CHOICE%"=="4" set "SYSTEMS=all"
call "%~dp0common.bat" :ask_choice "Edition" 1 "Both: the full application and the CLI edition" "The full application only" "The CLI edition only (the command line, without the window)"
if "%CHOICE%"=="2" set "EDITION=full"
if "%CHOICE%"=="3" set "EDITION=cli"
call "%~dp0common.bat" :show_command scripts\windows\package.bat --os %SYSTEMS% --edition %EDITION%
goto :run

:args
if "%~1"=="" goto :run
if /i "%~1"=="--os" goto :os_option
if /i "%~1"=="--edition" goto :edition_option
if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
rem cmd splits --os linux,macos at the comma: the systems after the first come as arguments
for %%S in (this windows linux macos all) do if /i "%~1"=="%%S" goto :system_argument
echo Error: Unknown option: %~1
goto :fail
:os_option
if "%~2"=="" (echo Error: --os needs a value, see --help& goto :fail)
shift
:system_argument
if defined OS_SET (set "SYSTEMS=%SYSTEMS%,%~1") else (set "SYSTEMS=%~1")
set "OS_SET=yes"
shift
goto :args
:edition_option
if "%~2"=="" (echo Error: --edition needs a value, see --help& goto :fail)
set "EDITION=%~2"
shift
shift
goto :args

:run
if /i not "%EDITION%"=="both" if /i not "%EDITION%"=="full" if /i not "%EDITION%"=="cli" (echo Error: Unknown edition '%EDITION%': use both, full or cli& goto :fail)
rem Splits the systems into the one built here and the ones built on GitHub Actions
set "BUILD_HERE="
set "REMOTE="
for %%S in (%SYSTEMS%) do call :add_system %%S || goto :fail
set "RUN_ID="
set "DESTINATION="

if not defined REMOTE goto :build_here
call "%~dp0common.bat" :step "Building for %REMOTE% on GitHub Actions (jpackage only builds for the system it runs on)"
where gh >nul 2>nul || (echo Error: The GitHub CLI was not found. Install it from https://cli.github.com and run: gh auth login& goto :fail)
gh auth status >nul 2>nul || (echo Error: The GitHub CLI is not logged in. Run: gh auth login& goto :fail)
pushd "%REPO_ROOT%"
for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
git fetch -q origin %BRANCH% 2>nul || goto :not_on_github
set "LOCAL_HEAD="
set "PUSHED_HEAD="
for /f %%H in ('git rev-parse HEAD') do set "LOCAL_HEAD=%%H"
for /f %%H in ('git rev-parse origin/%BRANCH%') do set "PUSHED_HEAD=%%H"
if "%LOCAL_HEAD%"=="%PUSHED_HEAD%" goto :pushed
echo Warning: GitHub builds the last pushed commit of %BRANCH%, which is not the one you have here.
if not defined ASKED goto :not_pushed
call "%~dp0common.bat" :ask_yes_no "Build the pushed commit anyway" N
if "%ANSWER%"=="no" goto :not_pushed
:pushed
set "DIRTY="
for /f %%C in ('git status --porcelain') do set "DIRTY=yes"
if defined DIRTY echo Warning: Changes that are not committed and pushed are not in the GitHub build.
set "PREVIOUS="
for /f %%R in ('gh run list --workflow release.yml --branch %BRANCH% --event workflow_dispatch --limit 1 --json databaseId --jq ".[].databaseId"') do set "PREVIOUS=%%R"
gh workflow run release.yml --ref %BRANCH% -f os=%REMOTE% -f edition=%EDITION% || (popd & goto :fail)
set "TRIES=0"
:wait_run
set /a TRIES+=1
if %TRIES% GTR 30 (popd & echo Error: The GitHub Actions run did not start: check the Actions tab of the repository.& goto :fail)
rem Waits 2 seconds (timeout cannot be used with redirected input)
ping -n 3 127.0.0.1 >nul
set "LATEST="
for /f %%R in ('gh run list --workflow release.yml --branch %BRANCH% --event workflow_dispatch --limit 1 --json databaseId --jq ".[].databaseId"') do set "LATEST=%%R"
if not defined LATEST goto :wait_run
if "%LATEST%"=="%PREVIOUS%" goto :wait_run
set "RUN_ID=%LATEST%"
for /f "delims=" %%U in ('gh run view %RUN_ID% --json url --jq ".url"') do echo Run %RUN_ID%: %%U
echo It goes on while the installers of this computer are built.
popd

:build_here
if not defined BUILD_HERE goto :remote_results
call "%~dp0common.bat" :check_java || goto :fail
call "%~dp0common.bat" :check_node || goto :fail
where candle.exe >nul 2>nul || (echo Error: WiX Toolset 3 was not found ^(candle.exe^). Install it from https://github.com/wixtoolset/wix3/releases and add its bin folder to PATH.& goto :fail)
set "OPTIONS="
if /i "%EDITION%"=="full" set "OPTIONS=-Dinstaller.skipCli=true"
if /i "%EDITION%"=="cli" set "OPTIONS=-Dinstaller.skipFull=true"
call "%~dp0common.bat" :step "Building the installers of this computer (mvnw -Dinstaller -DskipTests clean package)"
call "%~dp0common.bat" :mvnw -B -Dinstaller -DskipTests %OPTIONS% clean package || goto :fail

:remote_results
if not defined RUN_ID goto :list
call "%~dp0common.bat" :step "Waiting for the GitHub Actions run %RUN_ID%"
pushd "%REPO_ROOT%"
gh run watch %RUN_ID% --exit-status || (popd & echo Error: The GitHub Actions run %RUN_ID% failed: see the Actions tab of the repository.& goto :fail)
set "DESTINATION=%CORE_DIR%\target\installer\remote\run-%RUN_ID%"
if exist "%DESTINATION%" rd /s /q "%DESTINATION%"
gh run download %RUN_ID% --dir "%DESTINATION%" --pattern "installers-*" || (popd & goto :fail)
popd

:list
call "%~dp0common.bat" :step "Installers"
call :list_folder "%CORE_DIR%\target\installer\dist"
call :list_folder "%CORE_DIR%\target\installer\dist-cli"
if defined DESTINATION call :list_folder "%DESTINATION%"
call "%~dp0common.bat" :done 0
exit /b 0

:list_folder
rem The installers in a folder and its subfolders (for /r needs the folder in a parameter)
if not exist "%~1\" exit /b 0
for /r "%~1" %%F in (*.msi *.deb *.rpm *.dmg *.pkg) do echo %%F
exit /b 0

:add_system
if /i "%~1"=="this" (set "BUILD_HERE=yes" & exit /b 0)
if /i "%~1"=="windows" (set "BUILD_HERE=yes" & exit /b 0)
if /i "%~1"=="linux" (call :add_remote linux & exit /b 0)
if /i "%~1"=="macos" (call :add_remote macos & exit /b 0)
if /i "%~1"=="all" (
    set "BUILD_HERE=yes"
    call :add_remote linux
    call :add_remote macos
    exit /b 0
)
echo Error: Unknown system '%~1': use this, linux, windows, macos or all
exit /b 1

:add_remote
rem The systems built on GitHub Actions, separated by commas and without repeating one
if not defined REMOTE (set "REMOTE=%~1" & exit /b 0)
echo ,%REMOTE%, | find /i ",%~1," >nul && exit /b 0
set "REMOTE=%REMOTE%,%~1"
exit /b 0

:not_on_github
popd
echo Error: Branch %BRANCH% is not on GitHub: push it first (git push -u origin %BRANCH%).
goto :fail

:not_pushed
popd
echo Error: Push %BRANCH% first (git push) and start it again.
goto :fail

:usage
echo Usage: scripts\windows\package.bat [--os this^|linux^|windows^|macos^|all] [--edition both^|full^|cli]
echo.
echo   --os        Systems to build for, separated by commas (default: this, Windows). Linux and
echo               macOS are built on GitHub Actions and downloaded (needs gh and the branch pushed)
echo   --edition   both (default), full (the application) or cli (the CLI edition)
echo.
echo Without options it asks what to do.
exit /b 0

:fail
call "%~dp0common.bat" :done 1
exit /b 1
