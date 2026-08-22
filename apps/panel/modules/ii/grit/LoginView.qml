pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts

/**
 * First-open sign-in: email/password against the same Supabase project as
 * the Grit web and mobile apps.
 */
Item {
    id: root

    property bool busy: false

    ColumnLayout {
        anchors.centerIn: parent
        width: 340
        spacing: 10

        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: 8

            MaterialSymbol {
                text: "flag"
                iconSize: Appearance.font.pixelSize.hugeass
                color: Appearance.colors.colPrimary
            }
            GritText {
                text: "Grit"
                font.pixelSize: Appearance.font.pixelSize.huge
                font.family: Appearance.font.family.title
                color: Appearance.colors.colOnLayer0
            }
        }

        GritText {
            Layout.alignment: Qt.AlignHCenter
            text: Translation.tr("Sign in to sync your life")
            font.pixelSize: Appearance.font.pixelSize.small
            color: Appearance.colors.colSubtext
        }

        GritTextField {
            id: emailField
            Layout.fillWidth: true
            placeholderText: Translation.tr("Email")
            inputMethodHints: Qt.ImhEmailCharactersOnly
            onAccepted: passwordField.forceActiveFocus()
        }

        GritTextField {
            id: passwordField
            Layout.fillWidth: true
            placeholderText: Translation.tr("Password")
            echoMode: TextInput.Password
            onAccepted: root.doSignIn()
        }

        GritText {
            Layout.fillWidth: true
            visible: GritApi.authError !== ""
            text: GritApi.authError
            font.pixelSize: Appearance.font.pixelSize.smallest
            color: Appearance.colors.colError
            wrapMode: Text.WordWrap
        }

        RippleButton {
            Layout.fillWidth: true
            implicitHeight: 36
            enabled: !root.busy && emailField.text.length > 0 && passwordField.text.length > 0
            buttonRadius: Appearance.rounding.full
            colBackground: Appearance.colors.colPrimary
            colBackgroundHover: Appearance.colors.colPrimaryHover
            colRipple: Appearance.colors.colPrimaryActive
            onClicked: root.doSignIn()

            contentItem: Item {
                MaterialLoadingIndicator {
                    anchors.centerIn: parent
                    visible: root.busy
                    implicitSize: 22
                    colShape: Appearance.colors.colOnPrimary
                }
                GritText {
                    anchors.centerIn: parent
                    visible: !root.busy
                    text: Translation.tr("Sign in")
                    font.pixelSize: Appearance.font.pixelSize.normal
                    color: Appearance.colors.colOnPrimary
                }
            }
        }
    }

    function doSignIn() {
        if (root.busy)
            return;
        root.busy = true;
        GritApi.signIn(emailField.text.trim(), passwordField.text, err => {
            root.busy = false;
        });
    }
}
