## What's new in 0.5.1

- **Feedback button** in the top bar: opens a short anonymous form (in Spanish) in your browser.
- **`{{flow.name}}`** in message templates: each flow sends its own name, so cloned devices get their own ID.
- **Clone naming offsets:** `H${index+1}` names the clones of *H1* as *H2*, *H3*…
- **Conditional rules** can override a variable with a full generator (e.g. Random 40–120), not only with a fixed value.
- **Event loss per flow:** lose a random share of the messages and schedule outages (the last ticks of every N); lost messages are counted as **dropped** in the flow list and in Statistics.
- **Waypoint editor:** Waypoint Navigation is now usable, with a visual editor on the 2D plane or the map (also in fullscreen) and a coordinate table; waypoints outside the region or in a forbidden zone are flagged in red.
- **3D shapes define the generation region:** the cube, pyramid, cone or sphere drawn in the 3D view is where points are generated.
- **Fixes:**
  - a variable has a single value per message (repeated references, formulas and conditional rules all see the same value);
  - literal list items no longer turn into numbers, and new list items always get a unique id;
  - the selected pattern always wins over values left from a previous pattern;
  - Sequential plays every point of the graph; Drift with Bounce goes back and forth smoothly; integer Random can produce its maximum;
  - date sub-properties (`.timestamp`, `.hour`…) work with any date format, and the `ISO_INSTANT` format is accepted;
  - formulas read numbers that have a prefix or suffix, and are visible in the light theme;
  - Markov probabilities keep the decimal point while typing;
  - the Initial Value of numeric variables can be left empty; duplicate variable names are reported; fast typing no longer loses characters in the variable editors;
  - progressive clock drift works in every time mode; Circular Orbit turns around the centre of the region; Random Walk stays inside custom polygons and starts inside the region;
  - Graph Route Fixed Sequences can repeat nodes; list `.size`, `.first` and `.last` work with every strategy; Fixed Altitude uses its value in Geospatial;
  - flow names are unique inside a group and clones get ` (2)`, ` (3)`… instead of repeating a name, so File Output flows never write to the same file; renaming a variable to a taken name is no longer applied;
  - new Boolean variables start OFF as the editor shows; date sub-properties (`.hour`, `.year`…) work with every output format; the template autocomplete filters by what you type; the format buttons detect the template format;
  - Temporal variables without a Time Zone use the computer's zone; dates use English month and day names on every computer; two flows that map to the same output file get a clear error; locked groups and flows no longer take or create output files;
  - START shows why it cannot start (naming the variable) and starts nothing; format conversion keeps the content and reads quoted CSV fields; String masks give a value right after switching mode, and Mixed Case gives both cases; the Logs bin clears the list; a save or load dialog left open for a while no longer opens a second one;
  - the route editor uses the same scale on both axes; `Esc` closes the New Region and New Box Region confirmations; the Spatial Boundaries editor opens directly in fullscreen with a single button.
- **Behaviour changes for existing projects:**
  - Waypoint Navigation sends each waypoint once per lap, followed by Interpolation Steps − 1 points towards the next one;
  - Circular Orbit always turns around the centre of the region, unless an explicit orbit centre is set;
  - 3D points fill the drawn shape instead of a fixed 100 × 100 × 100 box;
  - Random Walk starts at the Fixed Point only when it is inside the region and outside obstacles, otherwise at a random valid position.
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
