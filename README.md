# Gen-Synth

Modular system for IoT simulation and synthesis with configurable flows.

## 📋 Project Structure


```
gen-synth/
├── core/                    # Java Backend (Maven)
│   ├── src/
│   │   └── main/java/com/gensynth/core/
│   │       ├── api/         # Interfaces and contracts
│   │       ├── clock/       # Global simulation tick clock
│   │       ├── engine/      # Execution engine
│   │       ├── flows/       # Flow management
│   │       ├── variables/   # Variable system
│   │       ├── connectors/  # Connectors (MQTT, Kafka, RabbitMQ)
│   │       ├── messaging/   # Internal communication
│   │       ├── metrics/     # Metrics collection
│   │       ├── common/      # Shared utilities
│   │       ├── config/      # Central configuration
│   │       └── App.java     # Entry point
│   └── pom.xml
│
└── simulator-ui/            # React Frontend (Vite + TypeScript)
    ├── src/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── postcss.config.js
```

## 🚀 Prerequisites

- **Java 21 LTS**
- **Maven 3.8+**
- **Node.js 18+** (for the frontend)
- **npm** or **pnpm**

## 📦 Installation

### Backend

```bash
cd core
mvn clean install
```

### Frontend

```bash
cd simulator-ui
npm install
```

## 🏃 Development

### Running the Backend

```bash
cd core
mvn clean compile
java -cp target/classes com.gensynth.core.App
```

### Running the Frontend

```bash
cd simulator-ui
npm run dev
```

The UI will be available at `http://localhost:5173`

### 🖥️ Desktop Mode (JCEF)

To build and run the application as a standalone desktop app with embedded Chromium:

1.  **Unified Build** (Compiles React + Java + Bundles Resources):
    ```bash
    cd core
    mvn clean package -DskipTests
    ```

2.  **Run in Desktop Mode**:
    - **Standard JDK (Linux/macOS)**:
      ```bash
      java -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop
      ```
    - **Standard JDK (Windows)**:
      ```bash
      java -cp "target/classes;target/dependency/*" com.gensynth.core.App --desktop
      ```
    
    > [!IMPORTANT]
    > **Running on JetBrains Runtime (JBR)?**
    > If you are using a JetBrains Runtime JDK (which bundles JCEF as a system module), you will hit a `NullPointerException` with the error `The build_meta.json file from the jcef-api artifact could not be read`.
    > To fix this, patch the built-in `jcef` module at runtime by adding the `--patch-module` JVM argument:
    > - **Linux/macOS (JBR)**:
    >   ```bash
    >   java --patch-module jcef=target/dependency/jcef-api-jcef-d3de827+cef-146.0.10+g8219561+chromium-146.0.7680.179.jar -cp "target/classes:target/dependency/*" com.gensynth.core.App --desktop
    >   ```
    > - **Windows (JBR)**:
    >   ```bash
    >   java --patch-module jcef=target/dependency/jcef-api-jcef-d3de827+cef-146.0.10+g8219561+chromium-146.0.7680.179.jar -cp "target/classes;target/dependency/*" com.gensynth.core.App --desktop
    >   ```

*Note: The first run will download the native Chromium binaries (~150MB) for your platform into the `core/jcef-bundle` directory.*

## 💾 Project Files (`.gsynth`)

Projects are saved and loaded as `.gsynth` files. They are JSON documents with a format marker:

```json
{
  "format": "gensynth-project",
  "version": "1.1.0",
  "exportedAt": "...",
  "groups": [],
  "variables": [],
  "settings": { "tick": { "mode": "FIXED_RATE", "value": 1, "unit": "SECONDS" } }
}
```

- The save/load dialogs (browser and desktop) only show `.gsynth` files, and saving always uses that extension.
- Loading rejects any file without the `.gsynth` extension or without `"format": "gensynth-project"`.
- Plain `.json` files are no longer accepted. To migrate an old configuration, rename it to `.gsynth` and add the `"format": "gensynth-project"` field.
- The format is defined in `core/.../persistence/ProjectFileFormat.java` and mirrored in `simulator-ui/src/app/core/fileStorage.ts`.
- Version `1.1.0` added the `settings` section (simulation clock). `1.0.0` files still load and get the default settings (1 tick per second).
- The Core also mirrors the current state in `core/state/` (`groups.json`, `variables.json`, `settings.json`) on every change.

## ⏱️ Simulation Clock (Ticks)

Message generation is paced by a single global **tick clock**, configured in **Settings → Simulation**:

- **Fixed period**: one tick every N milliseconds, seconds or minutes (whole number ≥ 1, at most 24 hours). Default: 1 second.
- **As Fast As You Can**: the next tick starts as soon as the previous one finishes, with no wait. Useful to measure the maximum throughput; it may keep a CPU core busy while running.

On every tick, each enabled flow of every running group publishes its **burst** (messages per tick); paused groups are skipped. Changes apply live, without stopping the simulation, and are saved with the project. The resource bar shows the measured rate (`TICK`, ticks/s and total ticks), and each flow's throughput is the measured messages per second.

Notes:
- The clock runs only while the system is running. It lives in `core/.../clock/TickClockImpl.java` (interfaces `ITickClock` / `ITickListener` in `api/`).
- The flow `interval` field is kept in project files for compatibility but is no longer used.
- Variable "ticks" (e.g. anomaly `whenTicks`, boolean patterns) count value generations of that variable, not global clock ticks.

## 🔧 Tech Stack

### Backend
- **Java 21 LTS**
- **Maven** (Dependency management)
- **Eclipse Paho** (MQTT)
- **RabbitMQ AMQP Client** (RabbitMQ)
- **Apache Kafka** (Kafka)
- **Java-WebSocket** (Real-time communication)

### Frontend
- **React 18** + **TypeScript**
- **Vite** (bundler)
- **Tailwind CSS** (styling)
- **Material-UI** (UI components)

## 📝 License

This project is licensed under the MIT License

## 👨‍💻 Author

Alejandro García Sánchez
