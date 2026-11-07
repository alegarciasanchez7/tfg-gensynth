# Development scripts

One script per task, for every OS:

- **Linux and macOS:** `scripts/unix/<name>.sh` (bash, also the bash 3.2 of macOS).
- **Windows:** `scripts\windows\<name>.bat` (plain batch files for `cmd.exe`, no PowerShell).

They run from any folder, always use the Maven Wrapper of the repository (`mvnw`) and accept
`--help`. On Windows they can also be opened with a double click: the window then waits for a key
before closing (set `GENSYNTH_NO_PAUSE=1` to skip it).

**Requirements:** JDK 21 or newer, and Node.js 20 or newer for the UI (the scripts check both and
say where to get them). The `package` script also needs `rpmbuild`/`dpkg-deb` on Linux and
WiX Toolset 3 on Windows.

## Scripts

| Script | What it does | Options |
|---|---|---|
| `setup` | Prepares a fresh clone: checks the tools, runs `npm ci`, builds and installs every module (`mvnw clean install -DskipTests`: plugin API, RabbitMQ, core with the UI and the private plugins when present) and leaves the core ready to run. | `--skip-ui` |
| `compile` | Compiles every module and leaves the core ready to run. | `--skip-ui` keeps the UI already built |
| `clean-compile` | `mvnw clean`, then the same as `compile`. | `--skip-ui` |
| `run-desktop` | Compiles and starts the desktop application. | `--skip-ui`, `--no-build`, a `.gsynth` file to open |
| `run-cli` | Compiles (without the UI, which it does not use) and starts the `gensynth` command line. | `--cli-edition` behaves like the CLI edition installer (no `edit`), `--no-build`, `--version` |
| `run-browser` | Starts the engine without a window (WebSocket on port 8765) and the Vite dev server with hot reload on http://localhost:5173. | `--no-build` |
| `test` | The checks of the CI: `mvnw verify`, then the UI lint, typecheck, tests with coverage and build. | `--backend`, `--frontend` |
| `analyze` | Static analysis without a server, then the list of findings with their file and line (below). | `core`, `plugin-api`, `ui`, `--all`, `--report-only` |
| `package` | Builds the installers of this OS: the full application in `core/target/installer/dist` and the CLI edition in `core/target/installer/dist-cli`. | `--skip-deb`, `--skip-rpm` (Linux) |
| `clean` | Deletes the build output (`target/`, the UI bundle, reports). | `--all` also deletes `core/state`, `core/logs`, `core/outputs`, `core/lib/shared` and `core/jcef-bundle` (asks first, `--yes` does not); installed plugins are kept |

Examples:

```bash
scripts/unix/setup.sh                      # once, after cloning
scripts/unix/run-desktop.sh ~/plant.gsynth  # open a project in the window
scripts/unix/run-cli.sh --cli-edition      # try the CLI edition
scripts/unix/test.sh --backend
```

```bat
scripts\windows\setup.bat
scripts\windows\run-cli.bat --cli-edition
```

## How the application runs from the sources

The `run-*` scripts start GenSynth from `core/`, where it keeps its state, logs, plugins and
outputs in development (see `AppPaths`). Its classpath is the compiled classes of every module
(`core`, `plugin-api`, `connectors/rabbitmq`) plus the external libraries, which every build copies
again to `core/target/dev-lib`. So a change in the plugin API is picked up without `install`, and a
stale or missing `core/target/dependency` (VS Code may rebuild `core/target` on its own) never
breaks a run. The same short classpath works on every OS:

```text
target/classes:../plugin-api/target/classes:../connectors/rabbitmq/target/classes:target/dev-lib/*
```

In the command line started by `run-cli`, relative paths start at `core/` (absolute paths and `~`
work anywhere). `run-desktop` turns a relative file passed to it into an absolute path.

## Code analysis

`analyze` checks the code locally, without a SonarQube server. Findings are listed in reports and
never fail the analysis.

| Part | What runs | Reports |
|---|---|---|
| `core`, `plugin-api` | `mvnw -Pcode-analysis verify`: the tests with JaCoCo coverage, SpotBugs (effort Max, threshold Medium), PMD (`quickstart` rules) and CPD (duplicated code) | `<module>/target/reports/spotbugs.html`, `pmd.html`, `cpd.html` and `<module>/target/site/jacoco/index.html` |
| `ui` | `npm run analyze`: ESLint with the SonarJS rules (`eslint.sonar.config.js`, the rules of SonarQube for JavaScript and TypeScript), `tsc --noEmit` and Vitest with coverage | `ui/reports/eslint-sonar.json`, `ui/coverage/index.html` |

Then it lists the findings of each part, grouped by file: the files with the most severe
findings first, each finding by line with its level (HIGH, MEDIUM, LOW, INFO), tool and rule,
and the message below:

```text
== core: 682 findings | HIGH 14, MEDIUM 223, LOW 341, INFO 104 | SpotBugs 133, PMD 544, CPD 5
   Showing HIGH and MEDIUM (237); --all also shows the 445 LOW and INFO ones.

core/src/main/java/com/gensynth/core/App.java  (13)
    25  HIGH    PMD       ClassWithOnlyPrivateConstructorsShouldBeFinal
                           This class has only private constructors and may be final
    32  MEDIUM  SpotBugs  MS_EXPOSE_REP
                           Public static App.getWsServer() may expose internal representation by returning App.wsServer
```

- **What:** `analyze core`, `analyze plugin-api` or `analyze ui` (or several); all of them by default.
- **Levels:** SpotBugs and PMD use their own priorities (PMD 4 and 5 are INFO); duplicated code
  is MEDIUM; in the UI, ESLint errors are HIGH, the SonarJS warnings MEDIUM and the other
  warnings (the debt that `npm run lint` already reports, such as `no-explicit-any`) LOW.
- **Options:** the console shows HIGH and MEDIUM, `--all` also LOW and INFO; every finding is
  always written to `target/code-analysis.txt`. `--report-only` lists the last analysis again
  without running it.

The listing is [`scripts/CodeAnalysisReport.java`](CodeAnalysisReport.java), run with the source launcher of the JDK (`java CodeAnalysisReport.java`),
so it is the same on every OS.

The `code-analysis` profile and `eslint.sonar.config.js` are not used by the normal build,
`npm run lint` or the CI. The SonarQube Cloud analysis of `dev` in the CI is still the reference.

## Continuous integration

The [Scripts workflow](../.github/workflows/scripts.yml) runs when this folder changes: on Linux and
macOS (with its `/bin/bash` 3.2) it runs the `.sh` scripts, and on Windows the real `.bat` files in
`cmd.exe`. It compiles without the UI and drives the command line in both editions.
