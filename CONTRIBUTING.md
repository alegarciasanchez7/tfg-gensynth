# Contributing to GenSynth

How to build GenSynth from source, check changes and publish releases. To use the application, see
the [User Guide](USER_GUIDE.md).

- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Development scripts](#development-scripts)
- [Build](#build)
- [Run](#run)
- [Local code analysis](#local-code-analysis)
- [Workflow](#workflow)
- [Continuous integration](#continuous-integration)
- [Releases](#releases)
- [Troubleshooting](#troubleshooting)

## Project structure

| Folder | Contents |
|---|---|
| `core/` | Simulation engine, desktop application and `gensynth` command line (Java 21, Maven). |
| `ui/` | User interface (React + TypeScript, Vite, Vitest). |
| `plugin-api/` | Public API for connector plugins: see the [Plugin Developer Guide](plugin-api/PLUGIN_DEVELOPER_GUIDE.md). |
| `connectors/rabbitmq/` | RabbitMQ connector, written as a plugin and included in the application (it is on the core's classpath, like File Output). |
| `packaging/` | Icons, release notes, the command line launcher and other resources of the installers (`linux-cli/`, `macos-cli/` and `windows-cli/` belong to the CLI edition). |
| `scripts/` | Development scripts: `unix/` (Linux and macOS) and `windows/` (batch files). See [Development scripts](#development-scripts). |

The root `pom.xml` builds the plugin API, the included connectors and the engine. The engine and the interface talk through
a WebSocket bridge on port **8765**.

## Requirements

| Software | Version | Why |
|---|---|---|
| Java (JDK) | 21 | Runs GenSynth |
| Node.js + npm | 20 or newer | Builds the user interface |
| Internet connection | first run only | Downloads the embedded browser (~150 MB) used by the desktop app |

Check your Java version with `java -version`. The scripts below check both versions for you.

## Development scripts

The [`scripts/`](scripts/README.md) folder has one script per task, the same for every OS:
`scripts/unix/<name>.sh` on Linux and macOS and `scripts\windows\<name>.bat` on Windows (they
can also be opened with a double click). Run them without options and they ask what to do, one
question at a time (Enter takes the default), then show the same command with options for next
time; with options they ask nothing. They always use the Maven Wrapper, run from any folder and
print `--help`.

| Script | What it does |
|---|---|
| `setup` | Checks JDK and Node.js, runs `npm ci` and `mvnw clean install -DskipTests`, and leaves the core ready to run. Run it once after cloning. |
| `compile` | Compiles every module (`--skip-ui` keeps the UI already built). |
| `clean-compile` | The same, after `mvnw clean`. |
| `run-desktop` | Compiles and starts the desktop application (a `.gsynth` file can be passed). |
| `run-cli` | Compiles (without the UI) and starts the `gensynth` command line; `--cli-edition` behaves like the CLI edition installer. |
| `run-browser` | Starts the engine and the Vite dev server, with hot reload, on http://localhost:5173. |
| `test` | The checks of the CI: `mvnw verify` and the lint, typecheck, tests and build of the UI. |
| `analyze` | Static analysis without a server, listing each finding with its file and line: see [Local code analysis](#local-code-analysis). |
| `package` | Builds the installers for the systems and edition chosen: this computer's here, the others on GitHub Actions (see [Releases](#releases)). |
| `clean` | Deletes the build output; `--all` also deletes the data of the application run from source. |

The run scripts start the application from `core/` with the classes of every module and the
libraries copied to `core/target/dev-lib`, so they never depend on `core/target/dependency`.

## Build

Run this once from the root folder of the project (and again after updating it):

```bash
./mvnw clean install -DskipTests       # Windows: mvnw.cmd clean install -DskipTests
```

This is what `setup` does. It builds the user interface and the application, and takes a couple of minutes the first time.
`mvnw` is the Maven Wrapper: it downloads the right Maven version by itself, so Maven does not need
to be installed. `-DskipUi=true` skips the UI build, for machines without Node.js.

## Run

> When built from source, always start GenSynth **from the `core` folder**: your installed
> plugins and the automatic state backups live there. The `run-*` scripts do it for you; the
> commands below are what they run.

### Desktop application (recommended)

```bash
cd core
java -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop    # Windows: use ; instead of :
```

A GenSynth window opens. The first start downloads the embedded browser into `core/jcef-bundle`,
so it can take a moment.

> [!IMPORTANT]
> **Using a JetBrains Runtime (JBR) JDK?** It already contains its own embedded browser and the
> start fails with `The build_meta.json file from the jcef-api artifact could not be read`.
> Add the `--patch-module` option (on Windows, use `;` instead of `:` in the classpath):
> ```bash
> java --patch-module jcef=target/dependency/jcef-api-jcef-d3de827+cef-146.0.10+g8219561+chromium-146.0.7680.179.jar -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop
> ```

### In the web browser (alternative)

Open two terminals:

1. Start the engine (without `--desktop`):
   ```bash
   cd core
   java -cp "target/classes:target/dependency/*" com.gensynth.core.App      # Windows: use ; instead of :
   ```
2. Start the interface:
   ```bash
   cd ui
   npm install      # first time only
   npm run dev
   ```
3. Open **http://localhost:5173** in your browser.

The interface talks to the engine on port **8765**, which must be free.

### Command line

The `gensynth` shell (see the [User Guide](USER_GUIDE.md#command-line)) is started from source with
its own main class. It opens no port, so it can run next to the two modes above:

```bash
cd core
java -cp "target/classes:target/dependency/*" com.gensynth.core.cli.CliMain      # Windows: use ; instead of :
```

Its log goes to `core/logs/cli.log`. The installers ship it as a second jpackage launcher,
`gensynth-cli` (configured in `packaging/launchers/`); the Linux packages link it as
`/usr/bin/gensynth` with the scripts in `packaging/linux/`, and the Windows installer adds
`cli\gensynth.cmd` for the `PATH`.

**CLI edition.** The release also ships the command line on its own (`GenSynth-CLI`): its main
launcher is `CliMain`, started with `-Dgensynth.edition=cli`, and its files
(`core/target/installer/input-cli`) leave out the JCEF libraries. The engine
(`com.gensynth.core.ws`) has no JCEF reference, so it runs without them; `AppEdition` detects the
edition (also when JCEF is missing from the classpath) and the shell then hides and refuses
`edit`. Try it from source with `scripts/unix/run-cli.sh --cli-edition`.

## Local code analysis

`scripts/unix/analyze.sh` (`scripts\windows\analyze.bat`) analyses the code without a SonarQube
server. Findings are listed in reports and never fail it:

| Part | Tools | Reports |
|---|---|---|
| `core`, `plugin-api` | `./mvnw -Pcode-analysis verify`: SpotBugs, PMD (`quickstart` rules), CPD (duplicated code) and the JaCoCo coverage | `target/reports/{spotbugs,pmd,cpd}.html`, `target/site/jacoco/index.html` |
| `ui` | `npm run analyze`: ESLint with the SonarJS rules ([`eslint.sonar.config.js`](ui/eslint.sonar.config.js)), `tsc --noEmit` and Vitest coverage | `reports/eslint-sonar.json`, `coverage/index.html` |

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

The listing is [`scripts/CodeAnalysisReport.java`](scripts/CodeAnalysisReport.java), run with the source launcher of the JDK (`java CodeAnalysisReport.java`),
so it is the same on every OS.

`npm run lint` and the CI keep the normal ESLint
config; the [SonarQube Cloud](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth)
analysis of `dev` is still the reference.

## Workflow

- Branches: `feat/*` (or `fix/*`, `docs/*`…) → `dev` (integration) → `main` (releases).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat`, `fix`, `docs`, `refactor`, `test`…).

## Continuous integration

Every pull request to `dev` or `main`, and every push to `main`, `dev`, `feat/**`, `fix/**` or `ci/**`,
runs the [CI workflow](.github/workflows/ci.yml) on GitHub Actions:

| Job | What it checks |
|---|---|
| **Frontend** | `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build` in `ui/`. |
| **Backend** | `./mvnw verify` (build, tests and JaCoCo coverage) on Linux, Windows and macOS. |
| **SonarQube analysis** | Only on `dev`: analyses the Java and TypeScript code on [SonarQube Cloud](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth) and fails when the Quality Gate fails. |

When `scripts/` changes, the [Scripts workflow](.github/workflows/scripts.yml) also runs the
development scripts on Linux, macOS (its bash 3.2) and Windows (the batch files in `cmd.exe`).

Run the same checks locally before pushing with `scripts/unix/test.sh`
(`scripts\windows\test.bat`), or by hand:

```bash
./mvnw verify                          # backend (also builds the UI)
cd ui && npm run lint && npm run typecheck && npm run test:coverage
```

The repository is also mirrored to GitLab, where [`.gitlab-ci.yml`](.gitlab-ci.yml) runs the same
checks on Linux.

## Releases

The [Release workflow](.github/workflows/release.yml) builds the installers with `jpackage` on
Windows (`.msi`), Linux (`.deb` and `.rpm`) and macOS (`.dmg`) and publishes them in a GitHub
Release, together with the CLI edition (`GenSynth-cli-installer-<version>`: `.msi`, `.deb`,
`.rpm` and `.pkg`). Before publishing, it runs the CLI edition without the JCEF libraries and
installs its package on each OS to check the `gensynth` command. Releases are always made from `main`:

1. Update the version in `pom.xml`, `core/pom.xml`, `ui/package.json` (and its
   `package-lock.json`), `ui/src/app/core/appInfo.ts` and `sonar-project.properties`
   (the workflow refuses to publish if they differ). The plugin API (`plugin-api/pom.xml`) has its
   own version, which only changes when its contract does.
2. Merge `dev` into `main`.
3. Tag `main` and push the tag:
   ```bash
   git switch main && git pull
   git tag v0.5.0
   git push origin v0.5.0
   ```

The workflow also refuses tags that are not on `main`. Pull requests that change the packaging
(`packaging/`, `core/pom.xml` or the workflow itself) and manual runs from the *Actions* tab are
dry runs: they build the installers as downloadable artifacts of the run and publish nothing. A
manual run can ask for some systems (`os`: `linux`, `windows`, `macos` or `all`) and one edition
(`edition`: `both`, `full` or `cli`).

`scripts/unix/package.sh` (`scripts\windows\package.bat`) builds installers for any system:
jpackage only builds for the system it runs on, so it builds this computer's installers here and
starts that manual run with the GitHub CLI for the others, waits for it and downloads them to
`core/target/installer/remote/` (the branch must be pushed). See
[Installers](scripts/README.md#installers). By hand, on the target system:

```bash
./mvnw -B -Dinstaller -DskipTests package          # Linux without rpmbuild: add -Dinstaller.skipRpm=true; without dpkg-deb (Fedora): -Dinstaller.skipDeb=true
```

The full application is written to `core/target/installer/dist` and the CLI edition to
`core/target/installer/dist-cli`. `-Dinstaller.skipFull=true` or `-Dinstaller.skipCli=true`
leaves one edition out (on Linux, `package` also sets the per-format properties of
`core/pom.xml`, such as `installer.skipCliRpm`).

## Troubleshooting

| Problem | Solution |
|---|---|
| `NoClassDefFoundError` or `ClassNotFoundException` when starting | The application is not fully built. Run `scripts/unix/clean-compile.sh` (`scripts\windows\clean-compile.bat`), or `./mvnw clean install -DskipTests` from the root folder. |
| The browser version shows "disconnected" | Start the engine first and check that port 8765 is free. |
