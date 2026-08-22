pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * The Shop: what XP is actually for. The wallet is spendable, the level runs off
 * lifetime XP, so buying something never demotes you.
 *
 * The catalogue is local to this machine. There is no Supabase table for it, so
 * it is deliberately kept out of GritSync.tableList. Purchases themselves are
 * ordinary ledger rows, which means the web app and the phone still agree on
 * your XP down to the point.
 */
StyledFlickable {
    id: root

    clip: true
    contentHeight: mainColumn.implicitHeight

    readonly property var suggestions: [
        { name: Translation.tr("2 hours of gaming"), cost: 1200 },
        { name: Translation.tr("A takeaway"), cost: 2000 },
        { name: Translation.tr("An evening off, no guilt"), cost: 2500 },
        { name: Translation.tr("Buy a game"), cost: 15000 }
    ]

    function addFromForm() {
        const cost = parseInt(costField.text);
        if (!GritStore.addReward(nameField.text, isNaN(cost) ? 0 : cost))
            return;
        nameField.text = "";
        costField.text = "";
        GritToast.show(Translation.tr("Reward added"), "add_shopping_cart");
    }

    ColumnLayout {
        id: mainColumn
        width: parent.width
        spacing: 8

        // ---- Wallet ----
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: walletColumn.implicitHeight + 20
            radius: Appearance.rounding.normal
            color: Appearance.colors.colLayer1
            border.width: 1
            border.color: Appearance.colors.colLayer0Border

            ColumnLayout {
                id: walletColumn
                anchors {
                    left: parent.left
                    right: parent.right
                    verticalCenter: parent.verticalCenter
                    leftMargin: 14
                    rightMargin: 14
                }
                spacing: 2

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    MaterialSymbol {
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: 4
                        text: "account_balance_wallet"
                        fill: 1
                        iconSize: Appearance.font.pixelSize.larger
                        color: Appearance.colors.colPrimary
                    }
                    GritText {
                        text: `${Math.round(GritStore.xp)}`
                        font.pixelSize: 26
                        font.family: "Google Sans Flex"
                        font.features: { "tnum": 1 }
                        font.variableAxes: { "wght": 800, "ROND": 100 }
                        color: Appearance.colors.colOnLayer1
                    }
                    GritText {
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: 4
                        text: Translation.tr("XP to spend")
                        font.pixelSize: Appearance.font.pixelSize.small
                        color: Appearance.colors.colSubtext
                    }
                    Item { Layout.fillWidth: true }
                    GritText {
                        Layout.alignment: Qt.AlignBottom
                        Layout.bottomMargin: 4
                        text: Translation.tr("level %1 · %2 lifetime")
                            .arg(GritStore.levelInfo.level).arg(Math.round(GritStore.lifetimeXp))
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        font.features: { "tnum": 1 }
                        color: Appearance.colors.colSubtext
                    }
                }

                GritText {
                    Layout.fillWidth: true
                    text: Translation.tr("Buying spends the wallet only. Your level runs off lifetime XP, which never goes down.")
                    font.pixelSize: Appearance.font.pixelSize.smallest
                    color: Appearance.colors.colSubtext
                    wrapMode: Text.Wrap
                }
            }
        }

        // ---- Add a reward ----
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            GritTextField {
                id: nameField
                Layout.fillWidth: true
                placeholderText: Translation.tr("Reward")
                onAccepted: root.addFromForm()
            }
            GritTextField {
                id: costField
                Layout.preferredWidth: 80
                placeholderText: Translation.tr("XP")
                validator: IntValidator { bottom: 1; top: 10000000 }
                onAccepted: root.addFromForm()
            }
            RippleButton {
                implicitHeight: 30
                buttonRadius: Appearance.rounding.full
                colBackground: Appearance.colors.colPrimary
                colBackgroundHover: Appearance.colors.colPrimaryHover
                colRipple: Appearance.colors.colPrimaryActive
                onClicked: root.addFromForm()
                contentItem: GritText {
                    anchors.centerIn: parent
                    horizontalAlignment: Text.AlignHCenter
                    leftPadding: 14
                    rightPadding: 14
                    text: Translation.tr("Add")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: Appearance.colors.colOnPrimary
                }
            }
        }

        // ---- Empty state: one tap starters ----
        ColumnLayout {
            Layout.fillWidth: true
            Layout.topMargin: 8
            visible: GritStore.rewards.length === 0
            spacing: 6

            GritText {
                text: Translation.tr("Nothing to buy yet. Tap one to add it, or write your own above. A reward only works if you would actually honour it.")
                font.pixelSize: Appearance.font.pixelSize.small
                color: Appearance.colors.colSubtext
                wrapMode: Text.Wrap
                Layout.fillWidth: true
            }
            Flow {
                Layout.fillWidth: true
                spacing: 8
                Repeater {
                    model: root.suggestions
                    delegate: RippleButton {
                        id: suggestion
                        required property var modelData
                        implicitHeight: 40
                        implicitWidth: suggestionRow.implicitWidth + 28
                        buttonRadius: Appearance.rounding.full
                        // Filled, otherwise a transparent RippleButton reads as
                        // loose text rather than something you can click.
                        colBackground: Appearance.colors.colLayer2
                        onClicked: GritStore.addReward(suggestion.modelData.name, suggestion.modelData.cost)
                        GritToolTip { text: Translation.tr("Add this reward to your shop") }
                        contentItem: RowLayout {
                            id: suggestionRow
                            anchors.centerIn: parent
                            spacing: 7

                            MaterialSymbol {
                                text: "add"
                                iconSize: Appearance.font.pixelSize.larger
                                color: Appearance.colors.colSubtext
                            }
                            GritText {
                                text: suggestion.modelData.name
                                font.pixelSize: Appearance.font.pixelSize.small
                                color: Appearance.colors.colOnLayer1
                            }
                            GritText {
                                text: `${suggestion.modelData.cost}`
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.features: { "tnum": 1 }
                                font.variableAxes: { "wght": 700, "ROND": 100 }
                                color: Appearance.colors.colSubtext
                            }
                        }
                    }
                }
            }
        }

        // ---- Catalogue ----
        Repeater {
            model: GritStore.rewards
            delegate: Rectangle {
                id: rewardRow
                required property var modelData
                readonly property bool affordable: GritStore.xp >= rewardRow.modelData.cost

                Layout.fillWidth: true
                implicitHeight: rewardLayout.implicitHeight + 14
                radius: Appearance.rounding.small
                color: Appearance.colors.colLayer1
                border.width: 1
                border.color: rewardRow.affordable ? Appearance.colors.colPrimary : Appearance.colors.colLayer0Border

                Behavior on border.color {
                    ColorAnimation { duration: Appearance.animation.elementMoveFast.duration }
                }

                RowLayout {
                    id: rewardLayout
                    anchors {
                        left: parent.left
                        right: parent.right
                        verticalCenter: parent.verticalCenter
                        leftMargin: 12
                        rightMargin: 6
                    }
                    spacing: 8

                    MaterialSymbol {
                        text: "redeem"
                        fill: rewardRow.affordable ? 1 : 0
                        iconSize: Appearance.font.pixelSize.larger
                        color: rewardRow.affordable ? Appearance.colors.colPrimary : Appearance.colors.colSubtext
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: -1

                        GritText {
                            Layout.fillWidth: true
                            text: rewardRow.modelData.name
                            font.pixelSize: Appearance.font.pixelSize.normal
                            font.weight: Font.DemiBold
                            color: Appearance.colors.colOnLayer1
                            elide: Text.ElideRight
                        }
                        GritText {
                            Layout.fillWidth: true
                            text: {
                                const cost = rewardRow.modelData.cost;
                                const bought = rewardRow.modelData.bought ?? 0;
                                const short = Math.max(0, cost - Math.round(GritStore.xp));
                                const boughtPart = bought > 0
                                    ? Translation.tr(" · bought %1×").arg(bought) : "";
                                return short > 0
                                    ? Translation.tr("%1 XP · %2 short").arg(cost).arg(short) + boughtPart
                                    : Translation.tr("%1 XP").arg(cost) + boughtPart;
                            }
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.variableAxes: { "wght": 500, "ROND": 100 }
                            color: Appearance.colors.colSubtext
                            elide: Text.ElideRight
                        }
                    }

                    RippleButton {
                        enabled: rewardRow.affordable
                        opacity: enabled ? 1 : 0.4
                        implicitHeight: 28
                        buttonRadius: Appearance.rounding.full
                        colBackground: Appearance.colors.colPrimary
                        colBackgroundHover: Appearance.colors.colPrimaryHover
                        colRipple: Appearance.colors.colPrimaryActive
                        onClicked: {
                            const id = rewardRow.modelData.id;
                            const name = rewardRow.modelData.name;
                            const cost = rewardRow.modelData.cost;
                            GritConfirm.ask(
                                Translation.tr("Buy \"%1\"?").arg(name),
                                Translation.tr("%1 XP leaves your wallet. Now go and actually take it.")
                                    .arg(cost),
                                () => {
                                    if (GritStore.buyReward(id))
                                        GritToast.show(Translation.tr("Bought: %1").arg(name), "redeem");
                                });
                        }
                        contentItem: GritText {
                            anchors.centerIn: parent
                            horizontalAlignment: Text.AlignHCenter
                            leftPadding: 12
                            rightPadding: 12
                            text: Translation.tr("Buy")
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            color: Appearance.colors.colOnPrimary
                        }
                    }
                    RippleButton {
                        implicitWidth: 32
                        implicitHeight: 32
                        buttonRadius: Appearance.rounding.full
                        onClicked: {
                            const id = rewardRow.modelData.id;
                            const name = rewardRow.modelData.name;
                            GritConfirm.ask(
                                Translation.tr("Delete reward?"),
                                Translation.tr("\"%1\" is removed from the shop. XP you already spent on it stays spent.").arg(name),
                                () => {
                                    GritStore.deleteReward(id);
                                    GritToast.show(Translation.tr("Deleted: %1").arg(name), "delete");
                                });
                        }
                        GritToolTip { text: Translation.tr("Delete reward") }
                        contentItem: MaterialSymbol {
                            anchors.centerIn: parent
                            horizontalAlignment: Text.AlignHCenter
                            text: "delete"
                            iconSize: Appearance.font.pixelSize.larger
                            color: Appearance.colors.colSubtext
                        }
                    }
                }
            }
        }

        Item { implicitHeight: 4 }
    }
}
