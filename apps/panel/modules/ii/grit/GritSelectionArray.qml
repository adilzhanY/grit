import QtQuick
import QtQuick.Layouts
import qs.modules.common

/**
 * Segmented single-choice selector in Grit's app font — grit-local variant
 * of ConfigSelectionArray, using GritSelectionGroupButton for its segments.
 */
Flow {
    id: root
    Layout.fillWidth: true
    spacing: 2
    property list<var> options: []
    property var currentValue: null

    signal selected(var newValue)

    Repeater {
        model: root.options
        delegate: GritSelectionGroupButton {
            id: segButton
            required property var modelData
            required property int index
            onYChanged: {
                if (index === 0) {
                    segButton.leftmost = true;
                } else {
                    var prev = root.children[index - 1];
                    var thisIsOnNewLine = prev && prev.y !== segButton.y;
                    segButton.leftmost = thisIsOnNewLine;
                    prev.rightmost = thisIsOnNewLine;
                }
            }
            leftmost: index === 0
            rightmost: index === root.options.length - 1
            buttonIcon: modelData.icon || ""
            buttonText: modelData.displayName
            toggled: root.currentValue == modelData.value
            onClicked: {
                root.selected(modelData.value);
            }
        }
    }
}
