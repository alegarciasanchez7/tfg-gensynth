package com.gensynth.core.api;

/**
 * Interfaz para conectores de datos.
 * Define el contrato para conectar con sistemas externos (MQTT, Kafka, etc).
 */
public interface IConnector {
    /**
     * Conecta con el sistema externo.
     */
    void connect();

    /**
     * Desconecta del sistema externo.
     */
    void disconnect();

    /**
     * Envía un mensaje al conector.
     * @param topic Tema/tópico
     * @param message Mensaje a enviar
     */
    void send(String topic, String message);

    /**
     * Comprueba si el conector está conectado.
     * @return true si está conectado, false en otro caso
     */
    boolean isConnected();
}
