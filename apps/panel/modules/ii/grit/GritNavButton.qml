import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts

RippleButton {
    id: root

    required property string navId
    required property string navName
    required property string navIcon
    property string current: ""
    property bool dim: false
    // Tab-hint mode (g): the mnemonic letter, underlined inside the label
    property string hintLetter: ""
    property bool hintActive: false
    readonly property bool selected: current === navId

    /**
     * The label with its mnemonic underlined, accelerator style. When the
     * assigned letter is not part of the name (mnemonics ran out), the letter
     * is appended as a suffix instead so it is still visible.
     */
    function hintedName() {
        const i = root.navName.toLowerCase().indexOf(root.hintLetter);
        // Qt colors stringify as #AARRGGBB; rich text wants #RRGGBB
        const raw = Appearance.colors.colPrimary.toString();
        const accent = "#" + raw.slice(-6);
        if (i < 0)
            return `${root.navName} <font color="${accent}"><b>${root.hintLetter}</b></font>`;
        return root.navName.slice(0, i)
            + `<font color="${accent}"><b><u>${root.navName.slice(i, i + 1)}</u></b></font>`
            + root.navName.slice(i + 1);
    }

    signal activated(string id)

    Layout.fillWidth: true
    implicitHeight: 30
    buttonRadius: Appearance.rounding.full
    colBackground: selected ? Appearance.colors.colSecondaryContainer : "transparent"
    colBackgroundHover: selected ? Appearance.colors.colSecondaryContainerHover : Appearance.colors.colLayer1Hover
    colRipple: selected ? Appearance.colors.colSecondaryContainerActive : Appearance.colors.colLayer1Active

    onClicked: root.activated(root.navId)

    Behavior on colBackground {
        ColorAnimation {
            duration: Appearance.animation.elementMoveFast.duration
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Appearance.animation.elementMoveFast.bezierCurve
        }
    }

    contentItem: RowLayout {
        spacing: 8

        Item { implicitWidth: 2 }

        MaterialSymbol {
            text: root.navIcon
            iconSize: Appearance.font.pixelSize.larger
            fill: root.selected ? 1 : 0
            color: root.dim ? Appearance.colors.colSubtext
                : root.selected ? Appearance.colors.colOnSecondaryContainer : Appearance.colors.colOnLayer1
        }
        GritText {
            Layout.fillWidth: true
            textFormat: root.hintActive && root.hintLetter !== "" ? Text.StyledText : Text.PlainText
            text: root.hintActive && root.hintLetter !== "" ? root.hintedName() : root.navName
            font.pixelSize: Appearance.font.pixelSize.small
            color: root.dim ? Appearance.colors.colSubtext
                : root.selected ? Appearance.colors.colOnSecondaryContainer : Appearance.colors.colOnLayer1
            elide: Text.ElideRight
        }
    }
}
