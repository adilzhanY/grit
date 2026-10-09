pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.common.functions
import qs.modules.iris
import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import "../../../services/grit/GritReadings.js" as Readings

/**
 * Full-screen reading overlay: a task that carries a text (see
 * GritReadings.js) opens it here, centred on the focused monitor, set in the
 * reading font with every stressed vowel tinted. Esc or a click outside the
 * sheet closes it; +/- resize the type.
 */
Scope {
    id: root

    readonly property var focusedScreen: Quickshell.screens.find(s => s.name === Hyprland.focusedMonitor?.name)

    Loader {
        id: readerLoader
        active: GritRead.shown

        sourceComponent: PanelWindow {
            id: readerWindow

            visible: readerLoader.active

            function hide() {
                GritRead.close();
            }

            exclusionMode: ExclusionMode.Ignore
            exclusiveZone: 0
            WlrLayershell.namespace: "quickshell:gritReader"
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
            color: ColorUtils.transparentize(Iris.ink, 0.12)

            anchors {
                top: true
                left: true
                right: true
                bottom: true
            }

            implicitWidth: root.focusedScreen?.width ?? 0
            implicitHeight: root.focusedScreen?.height ?? 0

            // Click anywhere outside the sheet to close
            MouseArea {
                anchors.fill: parent
                onClicked: readerWindow.hide()
            }

            StyledRectangularShadow {
                target: sheet
            }

            Rectangle {
                id: sheet

                readonly property var reading: GritRead.reading ?? ({ title: "", subtitle: "", stanzas: [] })
                readonly property int bodySize: Math.round(Appearance.font.pixelSize.larger * GritRead.fontScale)
                // NOT Appearance.font.family.reading: SF Pro Rounded, Google
                // Sans and Readex all drop U+0301 to the right of the vowel
                // instead of over it, which turns every stress mark into an
                // apostrophe. Noto's Cyrillic mark positioning is correct.
                readonly property string readingFamily: "Noto Serif"
                readonly property int padding: UiScale.px(44)

                anchors.centerIn: parent
                width: Math.min(parent.width - UiScale.px(120), UiScale.px(940))
                height: Math.min(parent.height - UiScale.px(120), sheetColumn.implicitHeight + padding * 2)
                radius: Appearance.rounding.windowRounding
                color: Iris.ink
                border.width: 1
                border.color: Iris.divider
                focus: true

                // Settle in rather than snapping into place
                opacity: 0
                scale: 0.97
                Component.onCompleted: {
                    sheet.opacity = 1;
                    sheet.scale = 1;
                }
                Behavior on opacity {
                    NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
                }
                Behavior on scale {
                    NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
                }

                // Swallow clicks so they don't reach the dismiss area behind
                MouseArea {
                    anchors.fill: parent
                }

                Keys.onPressed: event => {
                    switch (event.key) {
                    case Qt.Key_Escape:
                    case Qt.Key_Q:
                        readerWindow.hide();
                        event.accepted = true;
                        break;
                    case Qt.Key_Plus:
                    case Qt.Key_Equal:
                        GritRead.bigger();
                        event.accepted = true;
                        break;
                    case Qt.Key_Minus:
                        GritRead.smaller();
                        event.accepted = true;
                        break;
                    case Qt.Key_0:
                        GritRead.resetSize();
                        event.accepted = true;
                        break;
                    case Qt.Key_Down:
                    case Qt.Key_J:
                        bodyFlick.scrollBy(UiScale.px(120));
                        event.accepted = true;
                        break;
                    case Qt.Key_Up:
                    case Qt.Key_K:
                        bodyFlick.scrollBy(-UiScale.px(120));
                        event.accepted = true;
                        break;
                    case Qt.Key_Space:
                    case Qt.Key_PageDown:
                        bodyFlick.scrollBy(bodyFlick.height * 0.85);
                        event.accepted = true;
                        break;
                    case Qt.Key_PageUp:
                        bodyFlick.scrollBy(-bodyFlick.height * 0.85);
                        event.accepted = true;
                        break;
                    case Qt.Key_Home:
                        bodyFlick.contentY = 0;
                        event.accepted = true;
                        break;
                    case Qt.Key_End:
                        bodyFlick.contentY = Math.max(0, bodyFlick.contentHeight - bodyFlick.height);
                        event.accepted = true;
                        break;
                    }
                }

                ColumnLayout {
                    id: sheetColumn
                    anchors.fill: parent
                    anchors.margins: sheet.padding
                    spacing: UiScale.px(24)

                    // Header
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(16)

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: UiScale.px(2)

                            IrisText {
                                Layout.fillWidth: true
                                text: sheet.reading.title
                                font.family: sheet.readingFamily
                                font.pixelSize: Math.round(sheet.bodySize * 1.5)
                                font.weight: Font.DemiBold
                                color: Iris.fg
                                wrapMode: Text.Wrap
                                elide: Text.ElideNone
                            }
                            IrisText {
                                Layout.fillWidth: true
                                visible: text.length > 0
                                text: sheet.reading.subtitle ?? ""
                                font.pixelSize: Appearance.font.pixelSize.small
                                color: Iris.fg2
                                wrapMode: Text.Wrap
                                elide: Text.ElideNone
                            }
                        }

                        IrisDisc {
                            Layout.alignment: Qt.AlignTop
                            size: UiScale.px(40)
                            icon: "close"
                            tone: "ghost"
                            clickable: true
                            onClicked: readerWindow.hide()
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 1
                        color: Iris.divider
                    }

                    // Body
                    Item {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        // Preferred = the whole text, so a short reading makes
                        // a short sheet; fillHeight lets it shrink when capped.
                        Layout.preferredHeight: bodyColumn.implicitHeight

                        StyledFlickable {
                            id: bodyFlick
                            anchors.fill: parent
                            clip: true
                            contentHeight: bodyColumn.implicitHeight

                            function scrollBy(amount) {
                                const maxY = Math.max(0, contentHeight - height);
                                contentY = Math.max(0, Math.min(contentY + amount, maxY));
                            }

                            ColumnLayout {
                                id: bodyColumn
                                width: bodyFlick.width
                                spacing: Math.round(sheet.bodySize * 1.3)

                                Repeater {
                                    model: sheet.reading.stanzas ?? []

                                    delegate: ColumnLayout {
                                        id: stanza
                                        required property var modelData
                                        Layout.fillWidth: true
                                        spacing: Math.round(sheet.bodySize * 0.45)

                                        Repeater {
                                            model: stanza.modelData

                                            delegate: IrisText {
                                                required property string modelData
                                                Layout.fillWidth: true
                                                text: Readings.markup(modelData, Iris.fg)
                                                textFormat: Text.RichText
                                                font.family: sheet.readingFamily
                                                font.pixelSize: sheet.bodySize
                                                lineHeight: 1.35
                                                color: Iris.fg
                                                wrapMode: Text.Wrap
                                                elide: Text.ElideNone
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        ScrollEdgeFade {
                            target: bodyFlick
                            color: Iris.ink
                            fadeSize: UiScale.px(32)
                        }
                    }

                    // Footer hints
                    IrisText {
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                        text: Translation.tr("Esc to close · +/− text size · Space to scroll")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: Iris.fg2
                    }
                }
            }
        }
    }
}
