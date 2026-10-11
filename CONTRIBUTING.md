# Contributing to GenSynth

How to build GenSynth from source, check changes and publish releases. To use the application, see
the [User Guide](USER_GUIDE.md).

- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Build](#build)
- [Run](#run)
- [Workflow](#workflow)
- [Continuous integration](#continuous-integration)
- [Releases](#releases)
- [Troubleshooting](#troubleshooting)

## Project structure

| Folder | Contents |
|---|---|
| `core/` | Simulation engine and desktop application (Java 21, Maven). |
| `simulator-ui/` | User interface (React + TypeScript, Vite, Vitest). |
| `plugin-api/` | Public API for connector plugins: see the [Plugin Developer Guide](plugin-api/PLUGIN_DEVELOPER_GUIDE.md). |
| `packaging/` | Icons, release notes and other resources of the installers. |

The root `pom.xml` builds the plugin API and the engine. The engine and the interface talk through
a WebSocket bridge on port **8765**.

## Requirements

| Software | Version | Why |
|---|---|---|
| Java (JDK) | 21 | Runs GenSynth |
| Node.js + npm | 20 or newer | Builds the user interface |
| Internet connection | first run only | Downloads the embedded browser (~150 MB) used by the desktop app |

Check your Java version with `java -version`.

## Build

Run this once from the root folder of the project (and again after updating it):

```bash
./mvnw clean install -DskipTests       # Windows: mvnw.cmd clean install -DskipTests
```

This builds the user interface and the application. It takes a couple of minutes the first time.
`mvnw` is the Maven Wrapper: it downloads the right Maven version by itself, so Maven does not need
to be installed. `-DskipUi=true` skips the UI build, for machines without Node.js.

## Run

> When built from source, always start GenSynth **from the `core` folder**: your installed
> plugins and the automatic state backups live there.

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
   cd simulator-ui
   npm install      # first time only
   npm run dev
   ```
3. Open **http://localhost:5173** in your browser.

The interface talks to the engine on port **8765**, which must be free.

## Workflow

- Branches: `feat/*` (or `fix/*`, `docs/*`…) → `dev` (integration) → `main` (releases).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat`, `fix`, `docs`, `refactor`, `test`…).

## Continuous integration

Every pull request to `dev` or `main`, and every push to `main`, `dev`, `feat/**`, `fix/**` or `ci/**`,
runs the [CI workflow](.github/workflows/ci.yml) on GitHub Actions:

| Job | What it checks |
|---|---|
| **Frontend** | `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build` in `simulator-ui/`. |
| **Backend** | `./mvnw verify` (build, tests and JaCoCo coverage) on Linux, Windows and macOS. |
| **SonarQube analysis** | Only on `dev`: analyses the Java and TypeScript code on [SonarQube Cloud](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth) and fails when the Quality Gate fails. |

Run the same checks locally before pushing:

```bash
./mvnw verify                          # backend (also builds the UI)
cd simulator-ui && npm run lint && npm run typecheck && npm run test:coverage
```

The repository is also mirrored to GitLab, where [`.gitlab-ci.yml`](.gitlab-ci.yml) runs the same
checks on Linux.

## Releases

The [Release workflow](.github/workflows/release.yml) builds the installers with `jpackage` on
Windows (`.msi`), Linux (`.deb` and `.rpm`) and macOS (`.dmg`) and publishes them in a GitHub
Release. Releases are always made from `main`:

1. Merge `dev` into `main`.
2. For a new version, update it in `pom.xml`, `core/pom.xml`, `plugin-api/pom.xml`,
   `simulator-ui/package.json`, `simulator-ui/src/app/core/appInfo.ts` and
   `sonar-project.properties` (the workflow refuses to publish if they differ).
3. Tag `main` and push the tag:
   ```bash
   git switch main && git pull
   git tag v1.0.0
   git push origin v1.0.0
   ```

The workflow also refuses tags that are not on `main`. Pull requests that change the packaging
(`packaging/`, `core/pom.xml` or the workflow itself) and manual runs from the *Actions* tab are
dry runs: they build the installers as downloadable artifacts of the run and publish nothing.

To build the installer of your own OS locally (it is written to `core/target/installer/dist`):

```bash
./mvnw -B -Dinstaller -DskipTests package          # Linux without rpmbuild: add -Dinstaller.skipRpm=true
```

## Troubleshooting

| Problem | Solution |
|---|---|
| `NoClassDefFoundError` or `ClassNotFoundException` when starting | The application is not fully built. Run `./mvnw clean install -DskipTests` (`mvnw.cmd` on Windows) from the root folder again. |
| The browser version shows "disconnected" | Start the engine first and check that port 8765 is free. |
