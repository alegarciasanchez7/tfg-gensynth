package com.gensynth.core.connectors.runtime;
 
 
 import java.io.IOException;
 import java.net.URL;
 import java.net.URLClassLoader;
 import java.util.Enumeration;
 import java.util.List;
 
 /**
  * Custom ClassLoader that implements a "Parent-Last" strategy for plugin isolation.
  *
  * It prefers classes from the plugin's own JAR and shared libraries over the
  * core application's classpath, except for essential core API/SPI classes.
  */
 public class PluginClassLoader extends URLClassLoader {
 
     /**
      * Packages that MUST be loaded from the parent (Core) to ensure
      * compatibility between the engine and the plugin.
      */
     private static final List<String> DELEGATE_TO_PARENT_PREFIXES = List.of(
             "com.gensynth.core.api.",
             "com.gensynth.core.spi.",
             "com.gensynth.core.model.",
             "java.",
             "javax.",
             "org.slf4j." // Share logging bridge
     );
 
     public PluginClassLoader(URL[] urls, ClassLoader parent) {
         super(urls, parent);
     }
 
     @Override
     protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
         synchronized (getClassLoadingLock(name)) {
             // 1. Check if class is already loaded
             Class<?> c = findLoadedClass(name);
             if (c != null) {
                 return c;
             }
 
             // 2. Check if it's a core package that MUST be shared
             if (shouldDelegateToParent(name)) {
                 return super.loadClass(name, resolve);
             }
 
             // 3. Try to load from this ClassLoader (Child-First)
             try {
                 c = findClass(name);
             } catch (ClassNotFoundException e) {
                 // 4. Fallback to parent
                 c = super.loadClass(name, resolve);
             }
 
             if (resolve) {
                 resolveClass(c);
             }
             return c;
         }
     }
 
     @Override
     public URL getResource(String name) {
         // Prefer local resource
         URL url = findResource(name);
         if (url == null) {
             url = super.getResource(name);
         }
         return url;
     }
 
     @Override
     public Enumeration<URL> getResources(String name) throws IOException {
         // This is more complex, but for now we just let the parent handle the combined view
         return super.getResources(name);
     }
 
     private boolean shouldDelegateToParent(String className) {
         for (String prefix : DELEGATE_TO_PARENT_PREFIXES) {
             if (className.startsWith(prefix)) {
                 return true;
             }
         }
         return false;
     }
 }
