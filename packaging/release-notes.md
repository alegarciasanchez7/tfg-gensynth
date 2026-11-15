## What's new in 0.6.0

- **Command line:** the new `gensynth` command runs `.gsynth` projects from a terminal, without the window (see *Command line* below and the [User Guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md#command-line)). With `plugins add <file.jar>` it also imports connector plugins, with the same checks as the window and without restarting.
- **CLI edition:** new installers with only the command line, for servers and computers without a desktop.
- **Open projects with a double click:** `.gsynth` files open in GenSynth, and `edit <file.gsynth>` opens one from the terminal.
- **Simpler RabbitMQ:** by default you only fill in the broker (host, port, user and password) and the **Queue**, and the messages go straight to that queue. The exchange, its type, the routing key and the virtual host are under **Advanced options**; with an exchange, an empty routing key uses the queue name. The queue is now required: a project from an earlier version that only set an exchange asks for it when you open the flow.
- **Session folder always at hand:** the top of **Logs** shows the folder where the files of the session are written, from the moment you press START and after STOP, with **Copy** and **Open** (shows it in your file explorer). No filter hides it, so you no longer need to look for the *Output folder of this session* line.

## Download and install

| Your system | Download |
|---|---|
| Windows 10/11 (64-bit) | `GenSynth-installer-<version>.msi` |
| Ubuntu, Debian, Linux Mint… | `GenSynth-installer-<version>.deb` |
| Fedora, openSUSE, RHEL… | `GenSynth-installer-<version>.rpm` |
| macOS (Apple Silicon) | `GenSynth-installer-<version>.dmg` |

No Java installation is needed: everything GenSynth needs is included.

**CLI edition (no window):** for servers or computers without a desktop, these install only the
`gensynth` command line, without the window or its embedded browser (so `edit` is not available):

| Your system | Download |
|---|---|
| Windows 10/11 (64-bit) | `GenSynth-cli-installer-<version>.msi` |
| Ubuntu, Debian, Linux Mint… | `GenSynth-cli-installer-<version>.deb` |
| Fedora, openSUSE, RHEL… | `GenSynth-cli-installer-<version>.rpm` |
| macOS (Apple Silicon) | `GenSynth-cli-installer-<version>.pkg` |

The Linux and macOS packages add the `gensynth` command; on Windows, add `C:\Program Files\GenSynth-CLI\cli` to the `PATH` (see the [User Guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md#cli-edition)).

> [!IMPORTANT]
> **Before installing**
> - **Windows:** GenSynth is not signed, so Windows SmartScreen may show *"Windows protected your PC"*. Click **More info → Run anyway**.
> - **macOS:** the first time, right-click GenSynth in *Applications* and choose **Open** (or *System Settings → Privacy & Security → Open Anyway*). The disk image includes a `READ_ME_FIRST.txt` file with these steps. The CLI edition `.pkg` is not signed either: right-click it and choose **Open** to install it.
> - **Linux:** install with a double click or `sudo apt install ./GenSynth-installer-<version>.deb` (`sudo dnf install ./GenSynth-installer-<version>.rpm` on Fedora).
>
> **First start:** GenSynth downloads its embedded browser (about 150 MB), so it needs an internet connection. A window shows the progress, and it only happens once.

**Command line:** type `gensynth` in a terminal to start and stop `.gsynth` projects without the window, with Tab completion, a summary of a project before running it (`see`), live metrics (`metrics`), tick changes while it runs (`tick`) a clear explanation when a project cannot start, and `edit` to open a project in the window. Double-clicking a `.gsynth` file now opens it in GenSynth. It works in any terminal, including the text console of a server. The Linux packages set it up automatically; on Windows and macOS it needs a one-time step described in the [User Guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md#command-line).

`SHA256SUMS.txt` lists the checksum of every file.


