package com.gensynth.core.api;

/**
 * Interfaz principal del motor de flujos.
 * Define los contratos para la ejecución de flujos.
 */
public interface IFlowEngine {
    /**
     * Ejecuta un flujo por su identificador.
     * @param flowId Identificador del flujo
     */
    void executeFlow(String flowId);

    /**
     * Detiene la ejecución de un flujo.
     * @param flowId Identificador del flujo
     */
    void stopFlow(String flowId);

    /**
     * Pausa la ejecución de un flujo.
     * @param flowId Identificador del flujo
     */
    void pauseFlow(String flowId);
}
