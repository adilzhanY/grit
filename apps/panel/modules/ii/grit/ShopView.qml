pragma ComponentBehavior: Bound
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
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
        spacing: UiScale.px(12)

        // ---- Wallet ----
        IrisCard {
            spacing: UiScale.px(10)

            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(14)

                IrisDisc {
                    size: UiScale.px(56)
                    icon: "account_balance_wallet"
                    on: true
                    filled: true
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0

                    IrisText {
                        text: Translation.tr("%1 XP").arg(Math.round(GritStore.xp))
                        font.pixelSize: Appearance.font.pixelSize.hugeass
                        font.features: { "tnum": 1 }
                        font.weight: Font.ExtraBold
                        color: GritColors.fg
                    }
                    IrisText {
                        Layout.fillWidth: true
                        text: Translation.tr("to spend · level %1 · %2 lifetime")
                            .arg(GritStore.levelInfo.level).arg(Math.round(GritStore.lifetimeXp))
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        font.features: { "tnum": 1 }
                        color: GritColors.fg3
                        elide: Text.ElideRight
                    }
                }
            }

            IrisText {
                Layout.fillWidth: true
                text: Translation.tr("Buying spends the wallet only. Your level runs off lifetime XP, which never goes down.")
                font.pixelSize: Appearance.font.pixelSize.smallest
                color: GritColors.fg3
                wrapMode: Text.Wrap
                elide: Text.ElideNone
            }
        }

        // ---- Add a reward ----
        IrisCard {
            RowLayout {
                Layout.fillWidth: true
                spacing: UiScale.px(6)

                IrisField {
                    id: nameField
                    Layout.fillWidth: true
                    placeholderText: Translation.tr("Reward")
                    onAccepted: root.addFromForm()
                }
                IrisField {
                    id: costField
                    Layout.preferredWidth: UiScale.px(100)
                    placeholderText: Translation.tr("XP")
                    validator: IntValidator { bottom: 1; top: 10000000 }
                    onAccepted: root.addFromForm()
                }
                IrisPill {
                    primary: true
                    icon: "add"
                    text: Translation.tr("Add")
                    onClicked: root.addFromForm()
                }
            }
        }

        // ---- Empty state: one tap starters ----
        ColumnLayout {
            Layout.fillWidth: true
            visible: GritStore.rewards.length === 0
            spacing: UiScale.px(8)

            IrisText {
                Layout.fillWidth: true
                Layout.leftMargin: UiScale.px(6)
                text: Translation.tr("Nothing to buy yet. Tap one to add it, or write your own above. A reward only works if you would actually honour it.")
                font.pixelSize: Appearance.font.pixelSize.smaller
                color: GritColors.fg3
                wrapMode: Text.Wrap
                elide: Text.ElideNone
            }
            Flow {
                Layout.fillWidth: true
                spacing: UiScale.px(8)
                Repeater {
                    model: root.suggestions
                    delegate: IrisPill {
                        id: suggestion
                        required property var modelData
                        icon: "add"
                        onBlack: true
                        text: `${suggestion.modelData.name}  ${suggestion.modelData.cost}`
                        tip: Translation.tr("Add this reward to your shop")
                        onClicked: GritStore.addReward(suggestion.modelData.name, suggestion.modelData.cost)
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
                implicitHeight: Math.max(UiScale.px(60), rewardLayout.implicitHeight + UiScale.px(20))
                radius: UiScale.px(20)
                color: GritColors.raised

                RowLayout {
                    id: rewardLayout
                    anchors {
                        left: parent.left
                        right: parent.right
                        verticalCenter: parent.verticalCenter
                        leftMargin: UiScale.px(12)
                        rightMargin: UiScale.px(12)
                    }
                    spacing: UiScale.px(10)

                    IrisDisc {
                        size: UiScale.px(38)
                        icon: "redeem"
                        on: rewardRow.affordable
                        filled: rewardRow.affordable
                        tone: "card"
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0

                        IrisText {
                            Layout.fillWidth: true
                            text: rewardRow.modelData.name
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.weight: Font.DemiBold
                            color: GritColors.fg
                            elide: Text.ElideRight
                        }
                        IrisText {
                            Layout.fillWidth: true
                            text: {
                                const bought = rewardRow.modelData.bought ?? 0;
                                const boughtPart = bought > 0
                                    ? Translation.tr(" · bought %1×").arg(bought) : "";
                                return Translation.tr("%1 XP").arg(rewardRow.modelData.cost) + boughtPart;
                            }
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            font.features: { "tnum": 1 }
                            font.weight: Font.Medium
                            color: GritColors.fg3
                            elide: Text.ElideRight
                        }
                    }

                    // White "Buy" when affordable, else a well pill with what is missing
                    IrisPill {
                        compact: true
                        primary: rewardRow.affordable
                        enabled: rewardRow.affordable
                        opacity: 1
                        text: rewardRow.affordable
                            ? Translation.tr("Buy")
                            : Translation.tr("%1 short").arg(Math.max(0, rewardRow.modelData.cost - Math.round(GritStore.xp)))
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
                                }, Translation.tr("Buy"), false);
                        }
                    }
                    IrisDisc {
                        clickable: true
                        size: UiScale.px(32)
                        icon: "delete"
                        tone: "card"
                        tip: Translation.tr("Delete reward")
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
                    }
                }
            }
        }

        Item { implicitHeight: UiScale.px(4) }
    }
}
