package com.gensynth.plugin.api;

/**
 * Version of this plugin API. Changes within a major version are backward compatible
 * (only additions such as new default methods or field types), so a plugin built for
 * 1.0 keeps working with any 1.x GenSynth.
 */
public final class PluginApi {

    /** Current API version. */
    public static final String VERSION = "1.0";

    /** ServiceLoader file a plugin JAR must contain. */
    public static final String SERVICE_FILE = "META-INF/services/" + ConnectorPlugin.class.getName();

    private PluginApi() {
    }
}
