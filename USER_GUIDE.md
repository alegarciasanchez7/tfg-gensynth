# GenSynth User Guide

How to install and use GenSynth. For a quick overview, see the [README](README.md).

- [Installation](#installation)
- [The workspace](#the-workspace)
- [Typical workflow](#typical-workflow)
- [Groups](#groups)
- [Pace of the messages: ticks](#pace-of-the-messages-ticks)
- [Connectors](#connectors)
- [Saving your work](#saving-your-work)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

## Installation

Download the installer for your system from the
[**latest release**](https://github.com/alegarciasanchez7/tfg-gensynth/releases/latest).
Everything GenSynth needs is included: you do not need to install Java.

| Your system | File | How to install |
|---|---|---|
| Windows 10/11 (64-bit) | `GenSynth-installer-<version>.msi` | Double-click it and follow the steps. GenSynth appears in the Start menu. |
| Ubuntu, Debian, Linux Mint… | `GenSynth-installer-<version>.deb` | Double-click it, or `sudo apt install ./GenSynth-installer-<version>.deb` |
| Fedora, openSUSE, RHEL… | `GenSynth-installer-<version>.rpm` | `sudo dnf install ./GenSynth-installer-<version>.rpm` |
| macOS (Apple Silicon) | `GenSynth-installer-<version>.dmg` | Open it and drag GenSynth into *Applications*. |

> [!IMPORTANT]
> - **Windows:** GenSynth is not signed, so SmartScreen may show *"Windows protected your PC"*.
>   Click **More info → Run anyway**.
> - **macOS:** the first time, right-click GenSynth in *Applications* and choose **Open** (or
>   *System Settings → Privacy & Security → Open Anyway*). The disk image includes a
>   `READ_ME_FIRST.txt` file with these steps.
> - **First start:** GenSynth downloads its embedded browser (about 150 MB), so it needs an
>   internet connection. A window shows the progress; it only happens once.

To update, install the new version over the old one: your plugins and settings are kept.

### Where GenSynth keeps its files

| What | Installed application | Built from source |
|---|---|---|
| Plugins, autosave and embedded browser | Windows: `%LOCALAPPDATA%\GenSynth`<br>Linux: `~/.local/share/gensynth`<br>macOS: `~/Library/Application Support/GenSynth` | `core/` |
| Generated files (`OUTPUT_FILES_<date>`) | `~/GenSynth` (your user folder) | `core/` |

Uninstalling GenSynth does not delete these folders.

## The workspace

- **Left panel**: your **groups** and the **flows** inside them. Each flow shows its live
  **msg/s**, **sent** (messages delivered) and **fails** (messages that could not be sent).
- **Center**: the configuration of the selected group, flow or variable.
- **Right panel**: the **variables** you can insert in the message format.
- **Bottom panel**: logs, statistics and a preview of the generated messages.
- **Top bar**: start/stop, file actions (New, Load, Save, Save as), connectors and settings.
- **Resource bar** (just below): live CPU, RAM, network, msg/s, **TICK** (ticks per second and
  total) and uptime.

## Typical workflow

1. **Create a group** (the **+** button in the left panel).
2. **Add a flow** to the group: give it a name, choose how often it sends (*Every N ticks*) and a
   **connector** (where messages go), then fill in the connector fields.
3. **Write the message format** of the flow (JSON, XML, CSV or plain text) and insert variables
   with `{{variable}}`. The built-in tags `{{uuid}}`, `{{ts}}` (timestamp) and `{{n}}` (message
   number) are always available.
4. **Create variables** in the right panel (global, for one group or for one flow).
5. **Start** the system (or a single group) and watch the messages and metrics.
6. **Save** the project as a `.gsynth` file.

## Groups

- **Output mode** (applied the next time the group starts):
  - **Parallel**: every flow sends on its own, as soon as it generates a message.
  - **Sequential**: the messages of all flows are sent one after another, in the order they were
    generated.
- **Group menu (⋮)**: lock/unlock, clone, **Repeater** (create several flows with the same
  configuration and a naming pattern such as `Sensor ${index}`) and delete.
- Clicking a flow in the group panel opens its configuration.

## Pace of the messages: ticks

All flows follow one global clock, the **tick**, configured in **Settings → Simulation**:

- **Fixed period**: one tick every N milliseconds, seconds or minutes (default: 1 second).
- **As Fast As You Can**: no wait between ticks, to find out the maximum speed. It can keep a CPU
  core busy while running.

Each flow sends **one message every N ticks**. For example, with a tick of 1 second, a flow set to
*Every 5 ticks* sends one message every 5 seconds. Changing the tick applies immediately, even while
the simulation is running.

## Connectors

The connector of a flow decides where its messages go. Each connector shows its own fields; hover
the **ⓘ** icon next to a field to see what it means. Fields marked with **\*** are required, and a
flow cannot be created until they are filled in.

A message only counts as **sent** when the connector confirms that it was delivered; otherwise it
counts as a **fail**.

### File Output (built in)

GenSynth includes one connector, always available, that writes the messages of each flow to a file:

| Field | What it does |
|---|---|
| **File format** | *JSON array*, *Text* (one message per line), *XML dataset* or *CSV* (one message per line). |
| **Output directory** | Optional. When empty, files go to the folder of the current session, `OUTPUT_FILES_<date>/` (see [Where GenSynth keeps its files](#where-gensynth-keeps-its-files)). A sub-folder with the group name is always added. |
| **File name** | Optional. When empty, the flow name is used. The extension is added automatically. |

For example, with the Text format a flow *Sensor 1* in group *Plant A* writes to
`~/GenSynth/OUTPUT_FILES_<date>/Plant_A/Sensor_1.txt` (characters other than letters, digits, `.`,
`_` and `-` become `_`).

### Other destinations: connector plugins

Any other destination is added with a **connector plugin**: a single `.jar` file that teaches
GenSynth to send messages to a technology such as a message broker (AMQP, MQTT, Kafka…), a
TCP/UDP socket or an HTTP endpoint. Plugins are distributed separately from GenSynth and anyone can
implement one by following the [Plugin Developer Guide](plugin-api/PLUGIN_DEVELOPER_GUIDE.md).

To install a plugin, click **Connectors → Import plugin** in the top bar, drop the `.jar` file,
check that the validation succeeds and click **Install**. GenSynth restarts and the new connector
appears in the connector list of every flow, with its own fields.

Click **Connectors** in the top bar to open the catalog: it lists every loaded connector with its
description, its fields (help, default values and allowed ranges) and how many running flows use
it. Plugins can be uninstalled from there, and **Import plugin** is also available in the catalog.

## Saving your work

- Projects are saved as **`.gsynth`** files (**Save** / **Save as**), which contain the groups,
  flows, variables and the tick settings. Open them with **Load**.
- A `*` next to the project name means there are unsaved changes; GenSynth asks before closing
  or opening another project.
- **Auto-save** can be enabled in **Settings → Save & Storage**: it saves the open file every N
  seconds while there are changes.
- Projects from older GenSynth versions still open; settings they do not have get their defaults.

## Settings

Open them with the ⚙ icon in the top bar:

- **Appearance**: light or dark theme.
- **Save & Storage**: auto-save and its interval.
- **Simulation**: the tick clock (see [Pace of the messages](#pace-of-the-messages-ticks)).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` (`Cmd + S` on macOS) | Save the project. |
| `Ctrl + Z` (`Cmd + Z` on macOS) | Discard the unsaved changes of the selected group, flow or variable. With nothing selected, discards all unsaved changes after asking for confirmation. Inside a text field it works as a normal text undo. |

## Troubleshooting

| Problem | Solution |
|---|---|
| The first start shows *"GenSynth could not set up its embedded browser"* | The embedded browser could not be downloaded. Check your internet connection (and proxy or firewall) and click **Retry**. |
| The logs show *Invalid connector configuration…* when starting a group | A required connector field is empty or invalid; the message says which one. |
| A plugin is rejected as "built for the legacy plugin API" | That plugin was made for an older GenSynth; it must be rebuilt by its author. |
| *fails* keeps growing | Check the logs panel (bottom): it shows why the destination rejected the messages. |

Problems when building from source are covered in [CONTRIBUTING.md](CONTRIBUTING.md#troubleshooting).
