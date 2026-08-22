pragma Singleton

import QtQuick
import Quickshell

/**
 * Grit sound cues. Small synthesized wav files (generated once by
 * generate-sounds.py) played via pipewire; respects settings.soundsEnabled.
 */
Singleton {
    id: root

    readonly property string soundDir: Quickshell.shellPath("assets/grit-sounds")

    function play(kind) {
        if (!GritStore.settings.soundsEnabled)
            return;
        Quickshell.execDetached(["pw-play", `${root.soundDir}/${kind}.wav`]);
    }

    Connections {
        target: GritStore
        function onLevelUp(newLevel) {
            root.play("levelup");
        }
        function onMilestoneReached(label, xp) {
            root.play("milestone");
        }
    }
}
