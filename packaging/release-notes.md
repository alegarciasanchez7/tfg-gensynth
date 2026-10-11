## Download and install

| Your system | Download |
|---|---|
| Windows 10/11 (64-bit) | `GenSynth-installer-<version>.msi` |
| Ubuntu, Debian, Linux Mint… | `GenSynth-installer-<version>.deb` |
| Fedora, openSUSE, RHEL… | `GenSynth-installer-<version>.rpm` |
| macOS (Apple Silicon) | `GenSynth-installer-<version>.dmg` |

No Java installation is needed: everything GenSynth needs is included.

> [!IMPORTANT]
> **Before installing**
> - **Windows:** GenSynth is not signed, so Windows SmartScreen may show *"Windows protected your PC"*. Click **More info → Run anyway**.
> - **macOS:** the first time, right-click GenSynth in *Applications* and choose **Open** (or *System Settings → Privacy & Security → Open Anyway*). The disk image includes a `READ_ME_FIRST.txt` file with these steps.
> - **Linux:** install with a double click or `sudo apt install ./GenSynth-installer-<version>.deb` (`sudo dnf install ./GenSynth-installer-<version>.rpm` on Fedora).
>
> **First start:** GenSynth downloads its embedded browser (about 150 MB), so it needs an internet connection. A window shows the progress, and it only happens once.

**Command line:** type `gensynth` in a terminal to start and stop `.gsynth` projects without the window, with Tab completion of commands and paths. The Linux packages set it up automatically; on Windows and macOS it needs a one-time step described in the [User Guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md#command-line).

`SHA256SUMS.txt` lists the checksum of every file.
