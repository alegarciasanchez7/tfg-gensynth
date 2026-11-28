## What's new in 0.6.1

- **Easier updates on Windows:** the update installs in the same folder as before, with only a progress bar, and GenSynth opens again when it finishes. The installer also offers **Open GenSynth** on its last page. (Updating from 0.6.0 still shows the installer wizard once.)
- **Linux menu entry:** updating the `.rpm` no longer removes GenSynth from the applications menu. If 0.6.0 removed it, see *Troubleshooting* in the User Guide.
- **Software centers on Linux:** GNOME Software and similar apps show GenSynth with its description, screenshots and an **Open** button.
- **Shared variables:** a flow that falls behind the clock now sends the GROUP or GLOBAL value of its own tick, so every flow sends the same value on each tick.
- **macOS:** updated steps to open the app the first time on macOS 15.

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
> - **macOS:** GenSynth is not signed: the first time, go to *System Settings → Privacy & Security* and click **Open Anyway** (for the app or the CLI `.pkg`).
> - **First start:** the application downloads its embedded browser once (about 150 MB), so it needs an internet connection.
