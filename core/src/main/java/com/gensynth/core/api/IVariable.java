package com.gensynth.core.api;

/**
 * Interfaz para el sistema de variables.
 * Define el contrato para la gestión de variables en los flujos.
 */
public interface IVariable {
    /**
     * Obtiene el valor de la variable.
     * @return El valor de la variable
     */
    Object getValue();

    /**
     * Establece el valor de la variable.
     * @param value Nuevo valor
     */
    void setValue(Object value);

    /**
     * Obtiene el identificador de la variable.
     * @return El ID de la variable
     */
    String getId();

    /**
     * Obtiene el tipo de dato de la variable.
     * @return El tipo de dato
     */
    String getType();
}
