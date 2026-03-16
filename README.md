# Gen-Synth

Modular system for IoT simulation and synthesis with configurable flows.

## 📋 Project Structure


```
gen-synth/
├── core/                    # Java Backend (Maven)
│   ├── src/
│   │   └── main/java/com/gensynth/core/
│   │       ├── api/         # Interfaces and contracts
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
