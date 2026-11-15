# Installs a GenSynth .msi as a user would, checks that "gensynth" works by name in a new terminal
# (the installer puts its cli folder on the PATH, packaging/windows-msi/main.wxs), and uninstalls
# it, checking that the folder leaves the PATH. Used by the release workflow on Windows.
param(
    [Parameter(Mandatory)] [string] $Msi,
    # The cli folder the installer must put on the PATH
    [Parameter(Mandatory)] [string] $Folder,
    # The CLI edition says so in "gensynth --version"; the full application does not
    [switch] $CliEdition
)
$ErrorActionPreference = 'Stop'

function Test-OnMachinePath([string] $folder) {
    $entries = [Environment]::GetEnvironmentVariable('Path', 'Machine') -split ';' | ForEach-Object { $_.TrimEnd('\') }
    return $entries -contains $folder.TrimEnd('\')
}

function Invoke-Msi([string] $action, [string] $log) {
    $process = Start-Process msiexec.exe -ArgumentList "/$action `"$Msi`" /qn /l*v $log" -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Get-Content $log -Tail 50
        throw "msiexec /$action failed with exit code $($process.ExitCode)"
    }
}

$Msi = (Resolve-Path $Msi).Path
Invoke-Msi 'i' 'msi-install.log'

if (-not (Test-OnMachinePath $Folder)) { throw "The installer did not put $Folder on the PATH" }

# A new terminal: the PATH of the machine and of the user, as Windows gives it to new processes
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$command = (Get-Command gensynth -ErrorAction Stop).Source
Write-Output "gensynth is $command"
$version = gensynth --version
Write-Output $version
if ($version -notmatch 'GenSynth') { throw "Unexpected version: $version" }
if ($CliEdition -and $version -notmatch 'CLI edition') { throw "Not the CLI edition: $version" }
if (-not $CliEdition -and $version -match 'CLI edition') { throw "The application reports the CLI edition: $version" }
$session = "help`nexit`n" | gensynth
Write-Output $session
if (-not ($session -match 'Bye\.')) { throw 'The command line did not end' }

Invoke-Msi 'x' 'msi-uninstall.log'
if (Test-OnMachinePath $Folder) { throw "Uninstalling left $Folder on the PATH" }
Write-Output "OK: $Folder was on the PATH while installed, and was removed on uninstall"
