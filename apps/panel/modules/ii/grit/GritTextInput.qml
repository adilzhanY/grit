import qs.modules.common.widgets
import QtQuick

/** Inline text input in Grit's app font: Google Sans Flex, rounded. */
StyledTextInput {
    font.family: "Google Sans Flex"
    font.variableAxes: ({ "ROND": 100 })
    // Long text must stay inside the field instead of painting over the icons
    // and buttons next to it; autoScroll keeps the cursor in view.
    clip: true
}
