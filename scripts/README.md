# Development scripts

One script per task, for every OS:

- **Linux and macOS:** `scripts/unix/<name>.sh` (bash, also the bash 3.2 of macOS).
- **Windows:** `scripts\windows\<name>.bat` (plain batch files for `cmd.exe`, no PowerShell).

**Just run them.** Started without options (from a terminal, or with a double click on
Windows), a script asks what to do, one question at a time, and Enter takes the default answer
shown in capitals or in brackets:

```text
$ scripts/unix/run-cli.sh
Which command line:
  1) Full application (with edit, which opens projects in the window)
  2) CLI edition (as the CLI edition installer: no edit)
Choose 1-2 [1]: 2
Compile before starting? [Y/n]
(next time, without questions: scripts/unix/run-cli.sh --cli-edition)
```

The last line is the same command with options, which asks nothing: that is how the CI and other
scripts call them. With options, or with the input redirected, they never ask (set
`GENSYNTH_ASK=1` to answer the questions through a pipe, as the CI does). Every script also
accepts `--help`.

They run from any folder and always use the Maven Wrapper of the repository (`mvnw`). On Windows,
a script opened with a double click waits for a key before its window closes (set
`GENSYNTH_NO_PAUSE=1` to skip it).

**Requirements:** JDK 21 or newer, and Node.js 20 or newer for the UI (the scripts check both and
say where to get them). The `package` script also needs `rpmbuild`/`dpkg-deb` on Linux and
WiX Toolset 3 on Windows, and the [GitHub CLI](https://cli.github.com) (`gh auth login`) to build
for other systems.

## Scripts

| Script | What it asks (or its options) |
|---|---|
| `setup` | Prepares a fresh clone: checks the tools, runs `npm ci`, builds and installs every module (`mvnw clean install -DskipTests`: plugin API, RabbitMQ, core with the UI and the private plugins when present) and leaves the core ready to run. Asks whether to build the UI (`--skip-ui`). |
| `compile` | Compiles every module and leaves the core ready to run. Asks whether to build the UI too (`--skip-ui` keeps the one already built). |
| `clean-compile` | `mvnw clean`, then the same as `compile`. |
| `run-desktop` | Starts the desktop application. Asks whether to compile first (`--no-build`), whether to build the UI (`--skip-ui`) and which project to open (a `.gsynth` file). |
| `run-cli` | Starts the `gensynth` command line (without building the UI, which it does not use). Asks which one: the full application or the CLI edition, without `edit` (`--cli-edition`), and whether to compile first (`--no-build`). |
| `run-browser` | Starts the engine without a window (WebSocket on port 8765) and the Vite dev server with hot reload on http://localhost:5173. Asks whether to compile the core first (`--no-build`). |
| `test` | The checks of the CI: `mvnw verify`, then the UI lint, typecheck, tests with coverage and build. Asks what to check (`--backend`, `--frontend`). |
| `analyze` | Static analysis without a server, then the findings grouped by file ([below](#code-analysis)). Asks what to analyze (`core`, `plugin-api`, `ui`), whether to run it again or show the last one (`--report-only`) and whether to show the LOW and INFO findings too (`--all`). |
| `package` | Builds installers ([below](#installers)). Asks for which systems (`--os`), which edition (`--edition`) and, on Linux, which packages (`--type`). |
| `clean` | Deletes the build output (`target/`, the UI bundle, reports). Asks whether to delete also the data of the application run from the sources: `core/state`, `core/logs`, `core/outputs`, `core/lib/shared` and `core/jcef-bundle` (`--all`; installed plugins are kept). |

A `run-*` script compiles even when told not to if nothing is compiled yet (after a clean).

## Installers

jpackage only builds installers for the system it runs on: a Linux machine cannot build an
`.msi`, nor Windows a `.dmg`. So `package` builds the installers of this computer here and the
ones of the other systems on GitHub Actions, then downloads them:

```text
$ scripts/unix/package.sh
Installers for:
  1) This computer (Linux)
  2) Windows (built on GitHub Actions)
  3) macOS (built on GitHub Actions)
  4) Linux, Windows and macOS (the other two on GitHub Actions)
Choose 1-4 [1]: 2
Edition:
  1) Both: the full application and the CLI edition
  2) The full application only
  3) The CLI edition only (the command line, without the window)
Choose 1-3 [1]: 3
(next time, without questions: scripts/unix/package.sh --os windows --edition cli --type all)
```

| Where | Built by | Output |
|---|---|---|
| This computer | `mvnw -Dinstaller -DskipTests clean package`, with the edition and packages chosen | `core/target/installer/dist` (full application) and `dist-cli` (CLI edition) |
| The other systems | A manual run of the [Release workflow](../.github/workflows/release.yml) on the current branch, with only those systems and that edition (it publishes nothing). The script starts it with `gh`, builds this computer's installers meanwhile, waits for it and downloads them | `core/target/installer/remote/run-<id>/installers-<system>/` |

For the GitHub build, the branch must be pushed: GitHub builds the last pushed commit, so the
script warns when the local one is different or there are changes not committed. On Linux,
`--type deb` or `--type rpm` builds only one kind of package here (the GitHub build makes both).

Examples:

```bash
scripts/unix/setup.sh                                   # once, after cloning
scripts/unix/run-desktop.sh ~/plant.gsynth               # open a project in the window
scripts/unix/run-cli.sh --cli-edition                   # try the CLI edition
scripts/unix/package.sh --os all --edition cli          # the CLI edition for every system
```

```bat
scripts\windows\setup.bat
scripts\windows\package.bat --os windows,linux --edition full
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
`cmd.exe`. It compiles without the UI, drives the command line in both editions and answers the
questions of `run-cli` and `analyze` (through a pipe on Linux and macOS, with `GENSYNTH_ASK=1`,
and from a file on Windows). `package` is checked only for its options there; its GitHub
builds are the Release workflow itself.
