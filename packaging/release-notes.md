## What's new in 0.6.0

- **Command line:** `gensynth` runs `.gsynth` projects from a terminal, without the window, and imports connector plugins with `plugins add <file.jar>`.
- **CLI edition:** installers with only the command line, for servers.
- **Double click:** `.gsynth` files open in GenSynth.
- **Simpler RabbitMQ:** fill in the broker and the **Queue**; the exchange settings are under **Advanced options**. Projects that only set an exchange now ask for the queue.
- **Shared variables:** a GROUP or GLOBAL variable gives one value per tick, the same for every flow that uses it, and it can no longer read LOCAL variables.
- **Session folder:** the top of **Logs** shows where the files are written, with **Copy** and **Open**.

See the [User Guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md) for details.

## Download

| Your system | Application | CLI edition (no window) |
|---|---|---|
| Windows 10/11 (64-bit) | `GenSynth-installer-<version>.msi` | `GenSynth-cli-installer-<version>.msi` |
| Ubuntu, Debian, Linux Mint… | `GenSynth-installer-<version>.deb` | `GenSynth-cli-installer-<version>.deb` |
| Fedora, openSUSE, RHEL… | `GenSynth-installer-<version>.rpm` | `GenSynth-cli-installer-<version>.rpm` |
| macOS (Apple Silicon) | `GenSynth-installer-<version>.dmg` | `GenSynth-cli-installer-<version>.pkg` |

Java is included. `SHA256SUMS.txt` lists the checksum of every file.

> [!IMPORTANT]
> - **Windows:** GenSynth is not signed: in *"Windows protected your PC"*, click **More info → Run anyway**.
> - **macOS:** the first time, right-click GenSynth (or the CLI `.pkg`) and choose **Open**.
> - **First start:** the application downloads its embedded browser once (about 150 MB), so it needs an internet connection.
