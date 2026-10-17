## What's new in 0.5.1

- **Feedback button** in the top bar: opens a short anonymous form (in Spanish) in your browser.
- **`{{flow.name}}`** in message templates: each flow sends its own name, so cloned devices get their own ID.
- **Clone naming offsets:** `H${index+1}` names the clones of *H1* as *H2*, *H3*…
- **Conditional rules** can override a variable with a full generator (e.g. Random 40–120), not only with a fixed value.
- **Fixes:**
  - a variable has a single value per message (repeated references, formulas and conditional rules all see the same value);
  - literal list items no longer turn into numbers, and new list items always get a unique id;
  - the selected pattern always wins over values left from a previous pattern;
  - Sequential plays every point of the graph; Drift with Bounce goes back and forth smoothly; integer Random can produce its maximum;
  - date sub-properties (`.timestamp`, `.hour`…) work with any date format, and the `ISO_INSTANT` format is accepted;
  - formulas read numbers that have a prefix or suffix, and are visible in the light theme;
  - Markov probabilities keep the decimal point while typing;
  - the Initial Value of numeric variables can be left empty; duplicate variable names are reported; fast typing no longer loses characters in the variable editors.
- **[User guide](https://github.com/alegarciasanchez7/tfg-gensynth/blob/main/USER_GUIDE.md)** rewritten with screenshots.

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
