import qs.modules.common.widgets
import QtQuick

/**
 * Tooltip in Grit's app font: Google Sans Flex, rounded.
 *
 * StyledToolTip reads `parent.hovered` and treats a parent without that
 * property as permanently hovered, which pins the tip on screen over anything
 * that is not a button. Resolving the hover state here (RippleButton exposes
 * `hovered`, MouseArea exposes `containsMouse`) means a tooltip on a plain item
 * stays hidden instead of covering the panel.
 */
StyledToolTip {
    extraVisibleCondition: (parent?.hovered ?? parent?.containsMouse ?? false)
    font.family: "Google Sans Flex"
    font.variableAxes: ({ "ROND": 100 })
}
