package com.gensynth.core.api;

/**
 * Interfaz para métricas del sistema.
 * Define el contrato para recolectar y reportar métricas.
 */
public interface IMetrics {
    /**
     * Registra una métrica.
     * @param name Nombre de la métrica
     * @param value Valor de la métrica
     */
    void recordMetric(String name, double value);

    /**
     * Obtiene el valor de una métrica.
     * @param name Nombre de la métrica
     * @return Valor de la métrica
     */
    double getMetric(String name);

    /**
     * Resetea todas las métricas.
     */
    void reset();
}
