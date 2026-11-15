@echo off
rem "gensynth" command on Windows: the installer puts this folder on the PATH.
rem It runs the console launcher installed one folder up.
"%~dp0..\gensynth-cli.exe" %*
