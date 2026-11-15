@echo off
rem "gensynth" command of the GenSynth CLI edition: the installer puts this folder on the PATH.
rem It runs the console launcher installed one folder up.
"%~dp0..\GenSynth-CLI.exe" %*
