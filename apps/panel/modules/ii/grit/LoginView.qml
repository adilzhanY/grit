pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
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
        width: UiScale.px(340)
        spacing: UiScale.px(10)

        GritWordmark {
            Layout.alignment: Qt.AlignHCenter
            size: UiScale.px(44)
        }

        IrisText {
            Layout.alignment: Qt.AlignHCenter
            text: Translation.tr("Sign in to sync your life")
            role: "label"
            color: Iris.fg2
        }

        IrisField {
            id: emailField
            Layout.fillWidth: true
            placeholderText: Translation.tr("Email")
            inputMethodHints: Qt.ImhEmailCharactersOnly
            onAccepted: passwordField.forceActiveFocus()
        }

        IrisField {
            id: passwordField
            Layout.fillWidth: true
            placeholderText: Translation.tr("Password")
            password: true
            onAccepted: root.doSignIn()
        }

        IrisText {
            Layout.fillWidth: true
            visible: GritApi.authError !== ""
            text: GritApi.authError
            role: "caption"
            color: Iris.danger
            wrapMode: Text.WordWrap
            elide: Text.ElideNone
        }

        // The main action: a white pill; a spinner in it while signing in
        IrisPill {
            Layout.fillWidth: true
            primary: true
            text: root.busy ? "" : Translation.tr("Sign in")
            enabled: !root.busy && emailField.text.length > 0 && passwordField.text.length > 0
            onClicked: if (enabled) root.doSignIn()

            MaterialLoadingIndicator {
                anchors.centerIn: parent
                visible: root.busy
                implicitSize: UiScale.px(22)
                colShape: Iris.ink
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
