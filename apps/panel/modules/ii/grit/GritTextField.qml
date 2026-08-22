import QtQuick
import QtQuick.Controls
import qs.modules.common

/**
 * Grit's outlined text field: rounded bordered container with a floating
 * label — the label sits inside at full size while empty and glides up onto
 * the border when focused or filled. Everything in rounded Google Sans Flex.
 *
 * Drop-in for MaterialTextField: uses placeholderText as the label.
 * Set labelBackgroundColor to the surface behind the field so the label can
 * cut through the border cleanly.
 */
TextField {
    id: root

    property color labelBackgroundColor: Appearance.colors.colLayer0
    readonly property bool labelFloating: root.activeFocus || root.text.length > 0
        || root.preeditText.length > 0

    hoverEnabled: true
    font.family: "Google Sans Flex"
    font.pixelSize: Appearance.font.pixelSize.normal
    font.variableAxes: ({ "ROND": 100 })
    color: Appearance.colors.colOnLayer0
    placeholderTextColor: "transparent" // the floating label replaces it
    selectionColor: Appearance.colors.colPrimary
    selectedTextColor: Appearance.colors.colOnPrimary
    selectByMouse: true

    leftPadding: 16
    rightPadding: 16
    topPadding: 13
    bottomPadding: 13
    implicitHeight: 52
    implicitWidth: 120

    background: Rectangle {
        radius: 16
        color: "transparent"
        border.width: root.activeFocus ? 2 : 1.5
        border.color: root.activeFocus ? Appearance.colors.colPrimary
            : root.hovered ? Appearance.colors.colOnLayer1
            : Appearance.colors.colOutline

        Behavior on border.color {
            ColorAnimation {
                duration: Appearance.animation.elementMoveFast.duration
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Appearance.animation.elementMoveFast.bezierCurve
            }
        }
    }

    // Cuts the border where the floated label sits
    Rectangle {
        visible: root.placeholderText.length > 0
        anchors.centerIn: floatLabel
        width: floatLabel.implicitWidth + 10
        height: floatLabel.implicitHeight
        color: root.labelBackgroundColor
        opacity: root.labelFloating ? 1 : 0

        Behavior on opacity {
            NumberAnimation { duration: 120 }
        }
    }

    GritText {
        id: floatLabel
        visible: root.placeholderText.length > 0
        x: 14
        y: root.labelFloating ? -implicitHeight / 2 : (root.height - implicitHeight) / 2
        text: root.placeholderText
        font.pixelSize: root.labelFloating
            ? Appearance.font.pixelSize.small : Appearance.font.pixelSize.normal
        font.variableAxes: ({ "wght": 600, "ROND": 100 })
        color: root.activeFocus ? Appearance.colors.colPrimary : Appearance.colors.colSubtext

        Behavior on y {
            NumberAnimation {
                duration: Appearance.animation.elementMoveFast.duration
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Appearance.animationCurves.emphasizedDecel
            }
        }
        Behavior on font.pixelSize {
            NumberAnimation {
                duration: Appearance.animation.elementMoveFast.duration
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Appearance.animationCurves.emphasizedDecel
            }
        }
        Behavior on color {
            ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
        }
    }
}
