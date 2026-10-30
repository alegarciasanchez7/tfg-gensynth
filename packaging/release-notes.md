## What's new in 0.5.2

Fixes for the first reviews of the [user guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md) walkthrough:

- **Output folder** in *Settings → Save & Storage*: choose where each START creates its `OUTPUT_FILES_<date>` folder (by default `GenSynth` in your user folder). It is kept on this computer, not in the project file, and the **Output directory** of a File Output flow still overrides it. The Logs show the folder of each session when you press START.
- **New variables open their editor** right after **Create Variable**, so you can configure them at once.
- **Saving where you cannot write** (for example in `C:\Program Files\GenSynth`, the installation folder) now says that the folder is not writable and asks for another one, right in the save dialog, instead of *"Failed to export state"*.
- The **Feedback** button tooltip no longer says the form is anonymous: it asks for your email to follow up on bugs.

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

`SHA256SUMS.txt` lists the checksum of every file.

### Optional downloads

- `rabbitmq-connector-1.0.0.jar`: connector plugin to publish to RabbitMQ. Install it with **Connectors → Import plugin**; GenSynth restarts and RabbitMQ appears in the connector list.
