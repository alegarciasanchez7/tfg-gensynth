package com.gensynth.core.common;

/**
 * Clase de utilidades compartidas del proyecto.
 */
public final class CommonUtils {

    private CommonUtils() {
        // Clase de utilidades, no se instancia
    }

    /**
     * Valida que un parámetro no sea nulo.
     * @param param Parámetro a validar
     * @param message Mensaje de error
     */
    public static void requireNonNull(Object param, String message) {
        if (param == null) {
            throw new IllegalArgumentException(message);
        }
    }
}
