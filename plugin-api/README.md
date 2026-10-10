# GenSynth Plugin API

Contract implemented by GenSynth connector plugins (`com.gensynth:gensynth-plugin-api`).
It has no runtime dependencies and is provided by GenSynth at runtime, so plugins declare it
with `provided` scope.

A plugin implements a single interface, `com.gensynth.plugin.api.ConnectorPlugin`:

- `info()`: id, name, version and description of the connector;
- `fields()`: the configuration fields it needs, in display order (type, label, tooltip,
  required, default...). GenSynth renders them in the flow configuration and validates them;
- `connect(config, context)`: opens a `ConnectorSession` that sends the flow's messages.

Build and install it locally with `mvn install` (here or at the repository root).

See the [plugin developer guide](PLUGIN_DEVELOPER_GUIDE.md) for the full explanation.
