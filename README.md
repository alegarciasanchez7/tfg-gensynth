# GenSynth

[![CI](https://github.com/alegarciasanchez7/tfg-gensynth/actions/workflows/ci.yml/badge.svg)](https://github.com/alegarciasanchez7/tfg-gensynth/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=alegarciasanchez7_tfg-gensynth&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=alegarciasanchez7_tfg-gensynth&metric=coverage)](https://sonarcloud.io/summary/new_code?id=alegarciasanchez7_tfg-gensynth)
[![Latest release](https://img.shields.io/github/v/release/alegarciasanchez7/tfg-gensynth)](https://github.com/alegarciasanchez7/tfg-gensynth/releases/latest)

**Synthetic data generator for IoT and messaging systems.**

GenSynth produces realistic messages from templates filled with variables (numbers, texts, lists,
dates, coordinates, booleans…) and sends them at a controlled pace to files, message brokers or any
other destination. It lets you test consumers, dashboards and data pipelines without real devices.

- **Flows and groups**: model many data sources and run them in parallel or in sequence.
- **Precise pacing**: a global clock sets how often each flow sends.
- **Live metrics**: messages per second, deliveries and failures for every flow.
- **Extensible**: new destinations are added as connector plugins.

## Installation

1. Download the installer for your system from the
   [**latest release**](https://github.com/alegarciasanchez7/tfg-gensynth/releases/latest):

   | System | File |
   |---|---|
   | Windows 10/11 (64-bit) | `GenSynth-installer-<version>.msi` |
   | Ubuntu, Debian, Linux Mint… | `GenSynth-installer-<version>.deb` |
   | Fedora, openSUSE, RHEL… | `GenSynth-installer-<version>.rpm` |
   | macOS (Apple Silicon) | `GenSynth-installer-<version>.dmg` |

2. Run the installer. Java is included, so nothing else is needed.
3. Start GenSynth. The first start downloads its embedded browser (about 150 MB) once, so it needs
   an internet connection.

GenSynth is not signed, so Windows and macOS show a warning the first time. The
[User Guide](USER_GUIDE.md#installation) explains how to open it, where GenSynth keeps its files and
how to use the application.

## For developers

The engine is written in Java 21 (`core/`) and the interface in React + TypeScript
(`simulator-ui/`). To build and run it from source, with JDK 21 and Node.js 20 or newer:

```bash
./mvnw clean install -DskipTests
cd core
java -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop    # Windows: use ; instead of :
```

- [Contributing](CONTRIBUTING.md): project structure, build, tests, CI and releases.
- [Plugin Developer Guide](plugin-api/PLUGIN_DEVELOPER_GUIDE.md): create a connector plugin to send
  messages to a new technology.

## Credits

Developed by **Alejandro García Sánchez**
([@alegarciasanchez7](https://github.com/alegarciasanchez7)) as a Final Degree Project (TFG).
