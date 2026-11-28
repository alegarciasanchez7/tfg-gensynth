GenSynth - Read me first
========================

1. Install
   Drag GenSynth into the Applications folder.

2. First start: macOS may block the app
   GenSynth is not signed by Apple, so the first time you open it macOS says
   it could not verify GenSynth and does not open it. Click "Done", then:
     1. Open System Settings > Privacy & Security.
     2. Scroll down to Security: next to "GenSynth was blocked", click
        "Open Anyway" and confirm with your password.
     3. Click "Open Anyway" again in the dialog that appears.
   You only need to do this once. (Up to macOS 14 you can also right-click
   GenSynth in Applications and choose "Open"; macOS 15 no longer allows it.)

3. First start: internet connection needed
   On the first start GenSynth downloads its embedded browser (Chromium,
   about 150 MB). A window shows the progress. This only happens once.

4. Optional: the "gensynth" terminal command
   GenSynth can also run projects from Terminal, without its window. After
   opening GenSynth once (step 2), make the command available with:
     sudo mkdir -p /usr/local/bin
     sudo ln -sf /Applications/GenSynth.app/Contents/MacOS/gensynth-cli /usr/local/bin/gensynth
   Then type "gensynth" in a new Terminal window.

Where GenSynth keeps its files
   - Data (plugins, autosave, embedded browser):
     ~/Library/Application Support/GenSynth
   - Generated files (File Output connector): ~/GenSynth

More information: https://github.com/alegarciasanchez7/tfg-gensynth
