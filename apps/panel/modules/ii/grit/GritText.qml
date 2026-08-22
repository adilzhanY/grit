import qs.modules.common.widgets
import QtQuick

/**
 * Grit's app-wide text style: Google Sans Flex with fully rounded terminals.
 * Instances that need numeric styling can still override variableAxes with
 * their own map (keeping "ROND": 100 in it).
 */
StyledText {
    font.family: "Google Sans Flex"
    font.variableAxes: ({ "ROND": 100 })
}
