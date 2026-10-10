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
     * Obtiene el nombre de la variable.
     * @return El nombre de la variable
     */
    default String getName() {
        return getId();
    }

    /**
     * Obtiene el tipo de dato de la variable.
     * @return El tipo de dato
     */
    String getType();

    /**
     * Obtiene las dependencias de otras variables (por ID o nombre).
     * @return Un conjunto de IDs o Nombres de las variables de las que depende.
     */
    default java.util.Set<String> getDependencies() {
        return java.util.Collections.emptySet();
    }

    /**
     * Proporciona el contexto de evaluación (valores de otras variables).
     * @param context Mapa de variables evaluadas previamente.
     */
    default void setContext(java.util.Map<String, Object> context) {
        // Implementación por defecto no hace nada
    }
}
