import qs.modules.common
import qs.modules.iris
import QtQuick
import QtQuick.Layouts

/**
 * One row of the nav rail: the shared Iris nav row (disc + label, raised
 * pill behind the current view). In tab-hint mode (g) the view's mnemonic
 * letter shows as a key chip at the right end.
 */
IrisNavRow {
    id: root

    required property string navId
    required property string navName
    required property string navIcon
    // The id of the view that is open now
    property string currentView: ""
    // Tab-hint mode (g): the mnemonic letter for this view
    property string hintLetter: ""
    property bool hintActive: false

    signal activated(string id)

    Layout.fillWidth: true
    icon: root.navIcon
    text: root.navName
    current: root.currentView === root.navId
    onClicked: root.activated(root.navId)

    IrisKeycap {
        visible: root.hintActive && root.hintLetter !== ""
        variant: "on"
        mono: true
        text: root.hintLetter
    }
}
