# Gen-Synth

Sistema modular para simulación y síntesis de IoT con flujos configurables.

## 📋 Estructura del Proyecto

```
gen-synth/
├── core/                    # Backend Java (Maven)
│   ├── src/
│   │   └── main/java/com/gensynth/core/
│   │       ├── api/         # Interfaces y contratos
│   │       ├── engine/      # Motor de ejecución
│   │       ├── flows/       # Gestión de flujos
│   │       ├── variables/   # Sistema de variables
│   │       ├── connectors/  # Conectores (MQTT, Kafka, RabbitMQ)
│   │       ├── messaging/   # Comunicación interna
│   │       ├── metrics/     # Recolección de métricas
│   │       ├── common/      # Utilidades compartidas
│   │       ├── config/      # Configuración central
│   │       └── App.java     # Punto de entrada
│   └── pom.xml
│
└── simulator-ui/            # Frontend React (Vite + TypeScript)
    ├── src/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── postcss.config.js
```

## 🚀 Requisitos

- **Java 21 LTS**
- **Maven 3.8+**
- **Node.js 18+** (para el frontend)
- **npm** o **pnpm**

## 📦 Instalación

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

## 🏃 Desarrollo

### Ejecutar el Backend

```bash
cd core
mvn clean compile
java -cp target/classes com.gensynth.core.App
```

### Ejecutar el Frontend

```bash
cd simulator-ui
npm run dev
```

La UI estará disponible en `http://localhost:5173`

## 🔧 Stack Tecnológico

### Backend
- **Java 21 LTS**
- **Maven** (gestión de dependencias)
- **Eclipse Paho** (MQTT)
- **RabbitMQ AMQP Client** (RabbitMQ)
- **Apache Kafka** (Kafka)
- **Java-WebSocket** (Comunicación en tiempo real)

### Frontend
- **React 18** + **TypeScript**
- **Vite** (bundler)
- **Tailwind CSS** (estilos)
- **Material-UI** (componentes UI)

## 📝 Licencia

MIT

## 👨‍💻 Autor

Gen-Synth Development Team
