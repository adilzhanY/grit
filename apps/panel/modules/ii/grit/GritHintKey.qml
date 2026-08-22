import qs.modules.common
import QtQuick

/**
 * One keyboard hint letter, Material style: a small tonal chip in the
 * tertiary container role (distinct from the secondary-container XP chips),
 * monospace so every letter sits identically. Used for f-mode card jump
 * letters and the per-action mnemonics on the focused card.
 */
Rectangle {
    id: root

    property string letter: ""
    property real chipSize: 18

    implicitWidth: chipSize
    implicitHeight: chipSize
    radius: chipSize / 2
    color: Appearance.colors.colTertiaryContainer
    border.width: 1
    border.color: Appearance.colors.colTertiary

    // Pops in with the same fast curve the app uses for hover states
    scale: visible ? 1 : 0.6
    Behavior on scale {
        NumberAnimation {
            duration: Appearance.animation.elementMoveFast.duration
            easing.type: Easing.OutQuad
        }
    }

    Text {
        anchors.centerIn: parent
        text: root.letter
        font.family: Appearance.font.family.monospace
        font.pixelSize: root.chipSize * 0.62
        font.weight: Font.Bold
        color: Appearance.colors.colOnTertiaryContainer
    }
}
