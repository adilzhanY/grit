# Grit panel

The Hyprland desktop client for Grit: a Quickshell (QML) panel that slides the
whole tracker in from the screen edge. Daily quests, per-task focus ranks,
streak cards, a food log with a fasting timer, and an XP shop, keyboard first
with a vim layer and scriptable over IPC.

## Layout

```
modules/ii/grit/   the panel UI
services/grit/     store, sync, keybinds, sounds, alarms, IPC surface
```

The two directories mirror the paths they occupy inside the host shell, so the
`qs.*` imports and the relative `../../../services/grit/GritCore.js` import
resolve identically whether the code is read from here or through a symlink.

## Running it

The panel is a module of the [end-4 dots-hyprland](https://github.com/end-4/dots-hyprland)
shell rather than a standalone Quickshell config: it uses that shell's widget
library (`qs.modules.common`) and service layer (`qs.services`). To run it,
link these directories into an installed copy of that shell:

```sh
ln -sfn "$PWD/modules/ii/grit"  ~/.config/quickshell/ii/modules/ii/grit
ln -sfn "$PWD/services/grit"    ~/.config/quickshell/ii/services/grit
```

The host shell needs two hooks, which live in its own files:

```qml
// shell.qml
import "services/grit"

// GlobalStates.qml
property bool   gritOpen: false
property string gritView: "myday"
```

## IPC

Two handlers are exposed. `grit` drives the panel:

```sh
qs -c ii ipc call grit toggle              # show or hide
qs -c ii ipc call grit open                # show
qs -c ii ipc call grit close               # hide
qs -c ii ipc call grit view myday          # switch view
qs -c ii ipc call grit setMode <mode>      # switch mode
qs -c ii ipc call grit startFocus          # start a focus session
qs -c ii ipc call grit cancelFocus         # cancel it
qs -c ii ipc call grit completeNextSubtask # tick the next subtask
qs -c ii ipc call grit cheatsheet          # keybind cheatsheet
```

`gritKeys` (defined in `services/grit/GritKeys.qml`) carries the keybinding
surface, which is what Hyprland binds to.
