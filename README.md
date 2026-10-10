# GenSynth

[![CI](https://github.com/alegarciasanchez7/tfg-gensynth/actions/workflows/ci.yml/badge.svg)](https://github.com/alegarciasanchez7/tfg-gensynth/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=alegarciasanchez7_tfg-gensynth&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=alegarciasanchez7_tfg-gensynth&metric=coverage)](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth)

GenSynth is a **synthetic data generator** for IoT and messaging systems. You design **flows**
that produce messages from a template filled with **variables** (numbers, texts, lists, dates,
coordinates, booleans…), group them, and send them at a controlled pace to a destination: a file
out of the box, or any other system (message brokers, sockets…) through connector plugins. It is
useful to test consumers, dashboards and pipelines with realistic data without real devices.

---

## 🚀 Requirements

| Software | Version | Why |
|---|---|---|
| Java (JDK) | 21 | Runs GenSynth |
| Node.js + npm | 20 or newer | Builds the user interface |
| Internet connection | first run only | Downloads the embedded browser (~150 MB) used by the desktop app |

Check your Java version with `java -version`.

## 📦 Installation

Run this once from the root folder of the project (and again after updating it):

- **Linux / macOS**
  ```bash
  ./mvnw clean install -DskipTests
  ```
- **Windows**
  ```bash
  mvnw.cmd clean install -DskipTests
  ```

This builds the user interface and the application. It takes a couple of minutes the first time.
`mvnw` is the Maven Wrapper: it downloads the right Maven version by itself, so Maven does not need
to be installed.

## ▶️ Running GenSynth

> Always start GenSynth **from the `core` folder**: your installed plugins and the automatic state
> backups live there.

### Desktop application (recommended)

```bash
cd core
```

- **Linux / macOS**
  ```bash
  java -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop
  ```
- **Windows**
  ```bash
  java -cp "target/classes;target/dependency/*" com.gensynth.core.App --desktop
  ```

A GenSynth window opens. The first start downloads the embedded browser into `core/jcef-bundle`,
so it can take a moment.

> [!IMPORTANT]
> **Using a JetBrains Runtime (JBR) JDK?** It already contains its own embedded browser and the
> start fails with `The build_meta.json file from the jcef-api artifact could not be read`.
> Add the `--patch-module` option:
> - **Linux / macOS**
>   ```bash
>   java --patch-module jcef=target/dependency/jcef-api-jcef-d3de827+cef-146.0.10+g8219561+chromium-146.0.7680.179.jar -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop
>   ```
> - **Windows**
>   ```bash
>   java --patch-module jcef=target/dependency/jcef-api-jcef-d3de827+cef-146.0.10+g8219561+chromium-146.0.7680.179.jar -cp "target/classes;target/dependency/*" com.gensynth.core.App --desktop
>   ```

### In the web browser (alternative)

Open two terminals:

1. Start the engine (without `--desktop`):
   ```bash
   cd core
   java -cp "target/classes:target/dependency/*" com.gensynth.core.App      # Windows: use ; instead of :
   ```
2. Start the interface:
   ```bash
   cd simulator-ui
   npm install      # first time only
   npm run dev
   ```
3. Open **http://localhost:5173** in your browser.

The interface talks to the engine on port **8765**, which must be free.

---

## 🧭 Using GenSynth

### The workspace

- **Left panel**: your **groups** and the **flows** inside them. Each flow shows its live
  **msg/s**, **sent** (messages delivered) and **fails** (messages that could not be sent).
- **Center**: the configuration of the selected group, flow or variable.
- **Right panel**: the **variables** you can insert in the message format.
- **Bottom panel**: logs, statistics and a preview of the generated messages.
- **Top bar**: start/stop, file actions (New, Load, Save, Save as), connectors and settings.
- **Resource bar** (just below): live CPU, RAM, network, msg/s, **TICK** (ticks per second and
  total) and uptime.

### Typical workflow

1. **Create a group** (the **+** button in the left panel).
2. **Add a flow** to the group: give it a name, choose how often it sends (*Every N ticks*) and a
   **connector** (where messages go), then fill in the connector fields.
3. **Write the message format** of the flow (JSON, XML, CSV or plain text) and insert variables
   with `{{variable}}`. The built-in tags `{{uuid}}`, `{{ts}}` (timestamp) and `{{n}}` (message
   number) are always available.
4. **Create variables** in the right panel (global, for one group or for one flow).
5. **Start** the system (or a single group) and watch the messages and metrics.
6. **Save** the project as a `.gsynth` file.

### Groups

- **Output mode** (applied the next time the group starts):
  - **Parallel**: every flow sends on its own, as soon as it generates a message.
  - **Sequential**: the messages of all flows are sent one after another, in the order they were
    generated.
- **Group menu (⋮)**: lock/unlock, clone, **Repeater** (create several flows with the same
  configuration and a naming pattern such as `Sensor ${index}`) and delete.
- Clicking a flow in the group panel opens its configuration.

### Pace of the messages: ticks

All flows follow one global clock, the **tick**, configured in **Settings → Simulation**:

- **Fixed period**: one tick every N milliseconds, seconds or minutes (default: 1 second).
- **As Fast As You Can**: no wait between ticks, to find out the maximum speed. It can keep a CPU
  core busy while running.

Each flow sends **one message every N ticks**. For example, with a tick of 1 second, a flow set to
*Every 5 ticks* sends one message every 5 seconds. Changing the tick applies immediately, even while
the simulation is running.

---

## 🔌 Connectors

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
| **Output directory** | Optional. When empty, files go to the folder of the current session, `core/OUTPUT_FILES_<date>/`. A sub-folder with the group name is always added. |
| **File name** | Optional. When empty, the flow name is used. The extension is added automatically. |

For example, with the Text format a flow *Sensor 1* in group *Plant A* writes to
`core/OUTPUT_FILES_<date>/Plant_A/Sensor_1.txt` (characters other than letters, digits, `.`, `_`
and `-` become `_`).

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

---

## 💾 Saving your work

- Projects are saved as **`.gsynth`** files (**Save** / **Save as**), which contain the groups,
  flows, variables and the tick settings. Open them with **Load**.
- A `*` next to the project name means there are unsaved changes; GenSynth asks before closing
  or opening another project.
- **Auto-save** can be enabled in **Settings → Save & Storage**: it saves the open file every N
  seconds while there are changes.
- Projects from older GenSynth versions still open; settings they do not have get their defaults.

## ⚙️ Settings

Open them with the ⚙ icon in the top bar:

- **Appearance**: light or dark theme.
- **Save & Storage**: auto-save and its interval.
- **Simulation**: the tick clock (see *Pace of the messages*).

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` (`Cmd + S` on macOS) | Save the project. |
| `Ctrl + Z` (`Cmd + Z` on macOS) | Discard the unsaved changes of the selected group, flow or variable. With nothing selected, discards all unsaved changes after asking for confirmation. Inside a text field it works as a normal text undo. |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---|---|
| `NoClassDefFoundError` or `ClassNotFoundException` when starting | The application is not fully built. Run `./mvnw clean install -DskipTests` (`mvnw.cmd` on Windows) from the root folder again. |
| The browser version shows "disconnected" | Start the engine first (step 1) and check that port 8765 is free. |
| The logs show *Invalid connector configuration…* when starting a group | A required connector field is empty or invalid; the message says which one. |
| A plugin is rejected as "built for the legacy plugin API" | That plugin was made for an older GenSynth; it must be rebuilt by its author. |
| *fails* keeps growing | Check the logs panel (bottom): it shows why the destination rejected the messages. |

---

## 👩‍💻 For developers

- Creating a connector plugin for another technology: [Plugin Developer Guide](plugin-api/PLUGIN_DEVELOPER_GUIDE.md).
- The interface is in `simulator-ui/` (React + TypeScript) and the engine in `core/` (Java 21);
  the root `pom.xml` builds the plugin API and the engine.

### Continuous integration

Every push and pull request runs the [CI workflow](.github/workflows/ci.yml) on GitHub Actions:

| Job | What it checks |
|---|---|
| **Frontend** | `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build` in `simulator-ui/`. |
| **Backend** | `./mvnw verify` (build, tests and JaCoCo coverage) on Linux, Windows and macOS. |
| **SonarQube analysis** | Analyses the Java and TypeScript code on [SonarQube Cloud](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth) and fails when the Quality Gate fails. |

Run the same checks locally before pushing:

```bash
./mvnw verify                          # backend (also builds the UI)
cd simulator-ui && npm run lint && npm run typecheck && npm run test:coverage
```

`-DskipUi=true` skips the UI build in Maven, for machines without Node.js. The repository is also
mirrored to GitLab, where [`.gitlab-ci.yml`](.gitlab-ci.yml) runs the same checks on Linux.
Dependabot opens weekly pull requests to keep the dependencies up to date.

## 📝 License

This project is licensed under the MIT License.

## 👨‍💻 Author

Alejandro García Sánchez
