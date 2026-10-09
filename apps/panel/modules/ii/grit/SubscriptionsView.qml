pragma ComponentBehavior: Bound
import qs
import qs.services
import qs.services.grit
import qs.modules.common
import qs.modules.common.widgets
import qs.modules.iris
import Quickshell.Widgets
import QtQuick
import QtQuick.Layouts
import "../../../services/grit/GritCore.js" as Core

/**
 * Subscriptions: what is charging you, what is about to, and what the ones you
 * killed cost while they ran.
 *
 * Top to bottom: the commitment headline, trial and renewal warnings, the add
 * form, the active list, the charge-history chart over the usual range
 * selector, and the cancelled history.
 *
 * Amounts can be entered in euro, dollars or tenge; everything below the input
 * is euro, converted once when the row is written (see GritFx).
 */
Item {
    id: root

    readonly property var subs: GritSubs

    property bool showAddForm: false
    property string editingId: ""

    // ---- draft state for the add/edit form ----
    property string draftCurrency: "EUR"
    property string draftCycle: "monthly"
    property int draftTrialDays: 7
    property string draftTrialThen: "monthly"
    property string draftStart: GritStore.today
    property bool draftStartSet: false
    // The renewal schedule is entered as "which day it renews on", because that
    // is what you know about a subscription you already have. The start date is
    // a separate, optional question: when it began costing you.
    property int draftDom: Number(GritStore.today.slice(8, 10))
    property int draftMonth: Number(GritStore.today.slice(5, 7))
    property int draftWeekday: Core.weekdayOf(GritStore.today)
    property var draftReminders: Core.DEFAULT_REMINDER_DAYS.slice()

    function eur(v) {
        return Core.fmtMoney(v, "EUR");
    }

    function shortEur(v) {
        return Core.fmtMoneyShort(v, "EUR");
    }

    readonly property real draftAmount: Core.parseAmount(amountField.text) ?? 0
    readonly property bool canSubmit: nameField.text.trim() !== "" && root.draftAmount > 0

    /** Live preview of the euro figure that will actually be stored. */
    readonly property string convertedPreview: {
        if (root.draftCurrency === "EUR" || root.draftAmount <= 0)
            return "";
        return Translation.tr("= %1").arg(root.eur(GritFx.toEur(root.draftAmount, root.draftCurrency)));
    }

    function resetDraft() {
        nameField.clear();
        amountField.clear();
        root.draftCurrency = "EUR";
        root.draftCycle = "monthly";
        root.draftTrialDays = 7;
        root.draftTrialThen = "monthly";
        root.draftStart = GritStore.today;
        root.draftStartSet = false;
        root.draftDom = Number(GritStore.today.slice(8, 10));
        root.draftMonth = Number(GritStore.today.slice(5, 7));
        root.draftWeekday = Core.weekdayOf(GritStore.today);
        domField.text = String(root.draftDom);
        customTrialField.text = "";
        root.draftReminders = Core.DEFAULT_REMINDER_DAYS.slice();
        root.editingId = "";
    }

    function beginEdit(sub) {
        root.editingId = sub.id;
        nameField.text = sub.name ?? "";
        amountField.text = String(sub.amount ?? "");
        root.draftCurrency = sub.currency ?? "EUR";
        root.draftCycle = sub.cycle ?? "monthly";
        root.draftTrialDays = Number(sub.trialDays) || 7;
        root.draftTrialThen = sub.trialThen ?? "monthly";
        root.draftStart = Core.subStartDay(sub);
        // Only treat the start date as deliberate when it differs from the day
        // the row was created. Every row carries a startDate because adding one
        // defaults it to today; claiming that default was a choice turned the
        // optional "paying since" chip into a second, competing way to set the
        // renewal date, which is how a day typed there ended up overwriting it.
        root.draftStartSet = !!sub.startDate
            && sub.startDate !== Core.localDay(sub.createdAt ?? Date.now());
        const anchor = Core.subAnchorDay(sub);
        root.draftDom = Number(anchor.slice(8, 10));
        root.draftMonth = Number(anchor.slice(5, 7));
        root.draftWeekday = Core.weekdayOf(anchor);
        domField.text = String(root.draftDom);
        customTrialField.text = Core.TRIAL_PRESETS.indexOf(root.draftTrialDays) >= 0
            ? "" : String(root.draftTrialDays);
        root.draftReminders = (sub.reminderDays ?? Core.DEFAULT_REMINDER_DAYS).slice();
        root.showAddForm = true;
    }

    function submit() {
        if (!root.canSubmit)
            return;
        const today = GritStore.today;
        const payload = {
            name: nameField.text,
            amount: root.draftAmount,
            currency: root.draftCurrency,
            cycle: root.draftCycle,
            // Unset start date means "start counting from now", never a guess
            // at when the subscription actually began.
            startDate: root.draftStartSet ? root.draftStart : today,
            reminderDays: root.draftReminders.slice()
        };
        if (root.draftCycle === "trial") {
            payload.trialDays = root.draftTrialDays;
            payload.trialThen = root.draftTrialThen;
        } else if (root.draftCycle === "weekly") {
            payload.renewalAnchor = Core.anchorFromWeekday(root.draftWeekday, today);
        } else if (root.draftCycle === "annual") {
            payload.renewalAnchor = Core.anchorFromMonthDay(root.draftMonth, root.draftDom, today);
        } else {
            payload.renewalAnchor = Core.anchorFromDayOfMonth(root.draftDom, today);
        }
        if (root.editingId !== "") {
            GritStore.updateSubscription(root.editingId, payload);
            GritToast.show(Translation.tr("Updated %1").arg(payload.name), "edit");
        } else {
            GritStore.addSubscription(payload);
            GritToast.show(Translation.tr("Tracking %1").arg(payload.name), "subscriptions");
        }
        root.resetDraft();
        root.showAddForm = false;
    }

    function toggleReminder(days) {
        const list = root.draftReminders.slice();
        const i = list.indexOf(days);
        if (i >= 0)
            list.splice(i, 1);
        else
            list.push(days);
        list.sort((a, b) => b - a);
        root.draftReminders = list;
    }

    function cycleLabel(sub) {
        return Core.subCycleLabel(sub);
    }

    // ---------------- Range labels for the charge chart ----------------

    readonly property string rangeTitle: {
        const a = root.subs.anchorDay;
        if (root.subs.mode === "day") {
            if (a === GritStore.today)
                return Translation.tr("Today");
            if (a === Core.addDays(GritStore.today, -1))
                return Translation.tr("Yesterday");
            return Core.fmtDay(a);
        }
        if (root.subs.mode === "week") {
            const s = root.subs.rangeDays[0];
            const e = root.subs.rangeDays[1];
            const sName = Core.MONTHS_SHORT[Number(s.slice(5, 7)) - 1];
            const eName = Core.MONTHS_SHORT[Number(e.slice(5, 7)) - 1];
            return sName === eName
                ? `${Number(s.slice(8, 10))} to ${Number(e.slice(8, 10))} ${eName}`
                : `${Number(s.slice(8, 10))} ${sName} to ${Number(e.slice(8, 10))} ${eName}`;
        }
        if (root.subs.mode === "month")
            return `${Core.MONTHS_SHORT[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`;
        if (root.subs.mode === "year")
            return a.slice(0, 4);
        return Translation.tr("All time");
    }

    readonly property var topServices: root.subs.byService.slice(0, 5).map(d => d.label)
    readonly property color otherColor: Qt.alpha(GritColors.fg3, 0.8)

    function serviceColor(name) {
        const i = root.subs.byService.findIndex(d => d.label === name);
        return i >= 0 ? servicePie.seriesColors[i % servicePie.seriesColors.length]
            : GritColors.fg3;
    }

    function barSegments(perService) {
        const segs = [];
        let other = 0;
        for (const name in perService) {
            if (root.topServices.indexOf(name) >= 0)
                segs.push({ name: name, value: perService[name], color: root.serviceColor(name) });
            else
                other += perService[name];
        }
        segs.sort((a, b) => root.topServices.indexOf(a.name) - root.topServices.indexOf(b.name));
        if (other > 0)
            segs.push({ name: "__other", value: other, color: root.otherColor });
        return segs;
    }

    property int hoverBucket: -1

    // ---------------- Page ----------------

    StyledFlickable {
        anchors.fill: parent
        clip: true
        contentHeight: pageColumn.implicitHeight

        ColumnLayout {
            id: pageColumn
            width: parent.width
            spacing: UiScale.px(12)

            // ================ Commitment headline ================

            IrisCard {
                spacing: UiScale.px(6)

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(12)

                        ColumnLayout {
                            spacing: 0
                            IrisText {
                                text: root.eur(root.subs.monthlyEur)
                                font.pixelSize: Appearance.font.pixelSize.hugeass
                                font.features: { "tnum": 1 }
                                font.weight: Font.ExtraBold
                                color: GritColors.fg
                            }
                            IrisText {
                                text: Translation.tr("per month, across %1")
                                    .arg(root.subs.active.length === 1
                                        ? Translation.tr("1 subscription")
                                        : Translation.tr("%1 subscriptions").arg(root.subs.active.length))
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                color: GritColors.fg3
                            }
                        }
                        Item { Layout.fillWidth: true }
                        ColumnLayout {
                            Layout.alignment: Qt.AlignRight | Qt.AlignTop
                            spacing: 0
                            IrisText {
                                Layout.alignment: Qt.AlignRight
                                text: root.eur(root.subs.yearlyEur)
                                font.pixelSize: Appearance.font.pixelSize.large
                                font.features: { "tnum": 1 }
                                font.weight: Font.Bold
                                color: GritColors.fg2
                            }
                            IrisText {
                                Layout.alignment: Qt.AlignRight
                                text: Translation.tr("a year")
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                color: GritColors.fg3
                            }
                        }
                    }

                    IrisText {
                        Layout.fillWidth: true
                        visible: root.subs.trialMonthlyEur > 0
                        text: Translation.tr("Plus %1 a month once the running trials convert")
                            .arg(root.eur(root.subs.trialMonthlyEur))
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.danger
                        wrapMode: Text.Wrap
                        elide: Text.ElideNone
                    }
                    IrisText {
                        Layout.fillWidth: true
                        visible: root.subs.spentAllTimeEur > 0
                        text: Translation.tr("%1 spent on subscriptions all time")
                            .arg(root.eur(root.subs.spentAllTimeEur))
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.fg3
                    }
                    IrisText {
                        Layout.fillWidth: true
                        visible: GritFx.stale
                        text: Translation.tr("Offline: using stored exchange rates")
                        font.pixelSize: Appearance.font.pixelSize.smallest
                        color: GritColors.danger
                    }
            }

            // ================ Due soon ================

            Repeater {
                model: root.subs.upcoming.filter(u => u.days <= 7)
                delegate: IrisCard {
                    id: dueCard
                    required property var modelData
                    readonly property bool urgent: dueCard.modelData.isTrialEnd || dueCard.modelData.days <= 1
                    pad: UiScale.px(12)

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(12)

                        // Red only when it is close enough to act on
                        IrisDisc {
                            size: UiScale.px(38)
                            icon: dueCard.modelData.isTrialEnd ? "hourglass_bottom" : "event_upcoming"
                            tone: dueCard.urgent ? "danger" : "card"
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0

                            IrisText {
                                Layout.fillWidth: true
                                text: dueCard.modelData.isTrialEnd
                                    ? Translation.tr("%1 trial ends %2")
                                        .arg(dueCard.modelData.sub.name)
                                        .arg(root.subs.untilLabel(dueCard.modelData.day))
                                    : Translation.tr("%1 renews %2")
                                        .arg(dueCard.modelData.sub.name)
                                        .arg(root.subs.untilLabel(dueCard.modelData.day))
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                color: GritColors.fg
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: {
                                    const s = dueCard.modelData.sub;
                                    const price = root.eur(s.amountEur ?? 0);
                                    if (dueCard.modelData.isTrialEnd
                                        && (!s.trialThen || s.trialThen === "none"))
                                        return Translation.tr("Access ends on %1")
                                            .arg(Core.fmtDay(dueCard.modelData.day));
                                    if (dueCard.modelData.isTrialEnd)
                                        return Translation.tr("Then %1 %2, from %3")
                                            .arg(price)
                                            .arg(Core.subCycle(s.trialThen).name.toLowerCase())
                                            .arg(Core.fmtDay(dueCard.modelData.day));
                                    return `${price} · ${Core.fmtDay(dueCard.modelData.day)}`;
                                }
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: dueCard.urgent ? GritColors.danger : GritColors.fg3
                                elide: Text.ElideRight
                            }
                        }
                        IrisPill {
                            compact: true
                            dangerText: dueCard.urgent
                            text: Translation.tr("Cancel")
                            onClicked: {
                                const s = dueCard.modelData.sub;
                                GritConfirm.ask(
                                    Translation.tr("Cancel %1?").arg(s.name),
                                    Translation.tr("It moves to history. %1 spent so far.")
                                        .arg(root.eur(root.subs.spentOn(s))),
                                    () => GritStore.cancelSubscription(s.id),
                                    Translation.tr("Cancel it"));
                            }
                        }
                    }
                }
            }

            // ================ Add / edit form ================

            IrisPill {
                Layout.fillWidth: true
                visible: !root.showAddForm
                implicitHeight: UiScale.px(44)
                primary: true
                icon: "add"
                text: Translation.tr("Add a subscription")
                onClicked: {
                    root.resetDraft();
                    root.showAddForm = true;
                    nameField.forceActiveFocus();
                }
            }

            IrisCard {
                visible: root.showAddForm
                spacing: UiScale.px(12)

                    IrisText {
                        Layout.leftMargin: UiScale.px(4)
                        text: root.editingId !== "" ? Translation.tr("Edit subscription")
                            : Translation.tr("New subscription")
                        font.pixelSize: Appearance.font.pixelSize.smaller
                        color: GritColors.fg3
                    }

                    IrisField {
                        id: nameField
                        Layout.fillWidth: true
                        placeholderText: Translation.tr("Service")
                        onAccepted: root.submit()
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(6)

                        IrisField {
                            id: amountField
                            Layout.preferredWidth: UiScale.px(110)
                            placeholderText: GritFx.symbolOf(root.draftCurrency)
                            inputMethodHints: Qt.ImhFormattedNumbersOnly
                            onAccepted: root.submit()
                        }
                        Repeater {
                            model: GritFx.inputCurrencies
                            delegate: IrisChip {
                                id: curChip
                                required property var modelData
                                implicitHeight: UiScale.px(40)
                                implicitWidth: UiScale.px(46)
                                clickable: true
                                on: root.draftCurrency === curChip.modelData
                                text: GritFx.symbolOf(curChip.modelData)
                                tip: curChip.modelData
                                onClicked: root.draftCurrency = curChip.modelData
                            }
                        }
                        IrisText {
                            Layout.fillWidth: true
                            text: root.convertedPreview
                            font.pixelSize: Appearance.font.pixelSize.small
                            font.features: { "tnum": 1 }
                            font.weight: Font.Bold
                            color: GritColors.fg
                            elide: Text.ElideRight
                        }
                    }

                    // ---- Billing cycle ----
                    IrisSegmented {
                        Layout.fillWidth: true
                        equal: true
                        value: root.draftCycle
                        onSelected: v => root.draftCycle = v
                        options: Core.SUB_CYCLES.map(c => ({ label: c.name, value: c.id }))
                    }

                    // ---- Trial details, only when a trial is picked ----
                    ColumnLayout {
                        Layout.fillWidth: true
                        visible: root.draftCycle === "trial"
                        spacing: UiScale.px(8)

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: UiScale.px(6)

                            IrisText {
                                Layout.preferredWidth: UiScale.px(72)
                                text: Translation.tr("Length")
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                color: GritColors.fg3
                            }
                            Repeater {
                                model: Core.TRIAL_PRESETS
                                delegate: IrisChip {
                                    id: trialChip
                                    required property var modelData
                                    clickable: true
                                    on: root.draftTrialDays === trialChip.modelData
                                    text: Translation.tr("%1 days").arg(trialChip.modelData)
                                    onClicked: {
                                        root.draftTrialDays = trialChip.modelData;
                                        customTrialField.text = "";
                                    }
                                }
                            }
                            IrisField {
                                id: customTrialField
                                Layout.preferredWidth: UiScale.px(92)
                                placeholderText: Translation.tr("custom")
                                inputMethodHints: Qt.ImhDigitsOnly
                                validator: IntValidator { bottom: 1; top: 3650 }
                                onTextChanged: {
                                    const n = parseInt(customTrialField.text);
                                    if (isFinite(n) && n > 0)
                                        root.draftTrialDays = n;
                                }
                            }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: UiScale.px(6)

                            IrisText {
                                Layout.preferredWidth: UiScale.px(72)
                                text: Translation.tr("Then bills")
                                font.pixelSize: Appearance.font.pixelSize.smaller
                                color: GritColors.fg3
                            }
                            Repeater {
                                model: [
                                    { id: "monthly", name: Translation.tr("Monthly") },
                                    { id: "annual", name: Translation.tr("Yearly") },
                                    { id: "none", name: Translation.tr("Just ends") }
                                ]
                                delegate: IrisChip {
                                    id: thenChip
                                    required property var modelData
                                    clickable: true
                                    on: root.draftTrialThen === thenChip.modelData.id
                                    text: thenChip.modelData.name
                                    onClicked: root.draftTrialThen = thenChip.modelData.id
                                }
                            }
                        }
                    }

                    // ---- When it renews ----
                    //
                    // The primary schedule input. Filling in a service you
                    // already pay for, you know the day of the month it comes
                    // out, not the day you first signed up.
                    RowLayout {
                        Layout.fillWidth: true
                        visible: root.draftCycle !== "trial" && root.draftCycle !== "weekly"
                        spacing: UiScale.px(8)

                        IrisText {
                            text: Translation.tr("Renews on the")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: GritColors.fg2
                        }
                        IrisField {
                            id: domField
                            Layout.preferredWidth: UiScale.px(72)
                            horizontalAlignment: Text.AlignHCenter
                            placeholderText: Translation.tr("day")
                            inputMethodHints: Qt.ImhDigitsOnly
                            validator: IntValidator { bottom: 1; top: 31 }
                            // Deliberately NOT bound to draftDom. A two-way
                            // binding on `text` fights the person typing:
                            // clearing the field leaves draftDom on its old
                            // value, and the next keystroke re-asserts the
                            // binding, moving the cursor and dropping input, so
                            // the day you typed never reached the payload. The
                            // field is the input, draftDom is the state, and it
                            // flows one way; the seed values are assigned in
                            // resetDraft() and beginEdit().
                            onTextChanged: {
                                const n = parseInt(domField.text);
                                if (isFinite(n) && n >= 1 && n <= 31)
                                    root.draftDom = n;
                            }
                        }
                        IrisText {
                            visible: root.draftCycle !== "annual"
                            text: Translation.tr("of the month")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: GritColors.fg2
                        }
                        Item { Layout.fillWidth: true }
                        // Says plainly when the money next moves, so a
                        // mistyped day is obvious before saving.
                        IrisChip {
                            readonly property string nextText: {
                                const today = GritStore.today;
                                const anchor = root.draftCycle === "annual"
                                    ? Core.anchorFromMonthDay(root.draftMonth, root.draftDom, today)
                                    : Core.anchorFromDayOfMonth(root.draftDom, today);
                                const next = Core.subNextCharge({
                                    cycle: root.draftCycle, renewalAnchor: anchor,
                                    startDate: today, status: "active"
                                }, today);
                                return next ? Translation.tr("next %1").arg(Core.fmtDay(next)) : "";
                            }
                            visible: nextText !== ""
                            text: nextText
                        }
                    }

                    // Month, for a yearly subscription
                    Flow {
                        Layout.fillWidth: true
                        visible: root.draftCycle === "annual"
                        spacing: UiScale.px(4)

                        Repeater {
                            model: Core.MONTHS_SHORT
                            delegate: IrisChip {
                                id: monthChip
                                required property var modelData
                                required property int index
                                implicitWidth: UiScale.px(46)
                                clickable: true
                                on: root.draftMonth === monthChip.index + 1
                                text: monthChip.modelData
                                onClicked: root.draftMonth = monthChip.index + 1
                            }
                        }
                    }

                    // Weekday, for a weekly subscription
                    RowLayout {
                        Layout.fillWidth: true
                        visible: root.draftCycle === "weekly"
                        spacing: UiScale.px(4)

                        IrisText {
                            Layout.rightMargin: UiScale.px(4)
                            text: Translation.tr("Renews on")
                            font.pixelSize: Appearance.font.pixelSize.small
                            color: GritColors.fg2
                        }
                        Repeater {
                            model: Core.WEEK_ORDER
                            delegate: IrisChip {
                                id: dayChip
                                required property var modelData
                                Layout.fillWidth: true
                                clickable: true
                                on: root.draftWeekday === dayChip.modelData
                                text: Core.WEEKDAY_NAMES[dayChip.modelData]
                                onClicked: root.draftWeekday = dayChip.modelData
                            }
                        }
                    }

                    // ---- Optional: when it started costing you ----
                    RowLayout {
                        Layout.fillWidth: true
                        visible: root.draftCycle !== "trial"
                        spacing: UiScale.px(6)

                        IrisPill {
                            id: startPill
                            compact: true
                            icon: "history"
                            primary: root.draftStartSet
                            text: root.draftStartSet
                                ? Translation.tr("Paying since %1").arg(Core.fmtDay(root.draftStart))
                                : Translation.tr("Count from today")
                            tip: Translation.tr("Optional. Only set this if you know when you first subscribed; it decides how far back spending is counted.")
                            onClicked: datePicker.open()
                        }
                        IrisDisc {
                            visible: root.draftStartSet
                            size: UiScale.px(28)
                            clickable: true
                            icon: "close"
                            tip: Translation.tr("Forget the start date")
                            onClicked: {
                                root.draftStartSet = false;
                                root.draftStart = GritStore.today;
                            }
                        }
                        Item { Layout.fillWidth: true }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(6)

                        IrisText {
                            Layout.preferredWidth: UiScale.px(72)
                            text: Translation.tr("Remind")
                            font.pixelSize: Appearance.font.pixelSize.smaller
                            color: GritColors.fg3
                        }
                        Repeater {
                            model: [14, 7, 3, 1]
                            delegate: IrisChip {
                                id: remChip
                                required property var modelData
                                clickable: true
                                on: root.draftReminders.indexOf(remChip.modelData) >= 0
                                text: Translation.tr("%1d").arg(remChip.modelData)
                                onClicked: root.toggleReminder(remChip.modelData)
                            }
                        }
                        IrisText {
                            Layout.fillWidth: true
                            visible: root.draftReminders.length === 0
                            text: Translation.tr("no reminders")
                            font.pixelSize: Appearance.font.pixelSize.smallest
                            color: GritColors.fg3
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: UiScale.px(8)

                        Item { Layout.fillWidth: true }
                        IrisPill {
                            text: Translation.tr("Discard")
                            onClicked: {
                                root.resetDraft();
                                root.showAddForm = false;
                            }
                        }
                        IrisPill {
                            id: saveButton
                            primary: true
                            icon: root.editingId !== "" ? "check" : "add"
                            enabled: root.canSubmit
                            text: root.editingId !== "" ? Translation.tr("Save")
                                : Translation.tr("Track it")
                            onClicked: root.submit()
                        }
                    }
            }

            // ================ Active list ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.subs.active.length > 0
                icon: "subscriptions"
                text: Translation.tr("Active")
                side: Translation.tr("next charge")
            }

            Repeater {
                model: root.subs.active
                delegate: Rectangle {
                    id: subCard
                    required property var modelData
                    readonly property string nextDay: root.subs.nextCharge(subCard.modelData) ?? ""
                    readonly property int daysAway: root.subs.daysUntil(subCard.nextDay)
                    readonly property bool dueSoon: subCard.nextDay !== "" && subCard.daysAway >= 0 && subCard.daysAway <= 3
                    readonly property bool isTrial: subCard.modelData.cycle === "trial"
                        && (Core.subTrialEnd(subCard.modelData) ?? "") >= GritStore.today

                    Layout.fillWidth: true
                    implicitHeight: Math.max(UiScale.px(64), cardRow.implicitHeight + UiScale.px(20))
                    radius: UiScale.px(20)
                    color: cardHover.hovered ? GritColors.raisedHover : GritColors.raised
                    border.width: subCard.isTrial ? 1 : 0
                    border.color: Qt.alpha(GritColors.danger, 0.6)

                    Behavior on color {
                        ColorAnimation { duration: Iris.colorDuration }
                    }

                    HoverHandler { id: cardHover }

                    RowLayout {
                        id: cardRow
                        anchors {
                            left: parent.left
                            right: parent.right
                            verticalCenter: parent.verticalCenter
                            leftMargin: UiScale.px(12)
                            rightMargin: UiScale.px(10)
                        }
                        spacing: UiScale.px(10)

                        IrisDisc {
                            size: UiScale.px(36)
                            icon: subCard.isTrial ? "hourglass_top" : "autorenew"
                            on: subCard.dueSoon
                            tone: "well"
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0

                            IrisText {
                                Layout.fillWidth: true
                                text: subCard.modelData.name || Translation.tr("Untitled")
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                color: GritColors.fg
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: {
                                    const s = subCard.modelData;
                                    const parts = [`${root.eur(s.amountEur ?? 0)} ${root.cycleLabel(s).toLowerCase()}`];
                                    // Only worth showing when it is not already euro
                                    if ((s.currency ?? "EUR") !== "EUR")
                                        parts.push(`${GritFx.symbolOf(s.currency)}${s.amount}`);
                                    return parts.join(" · ");
                                }
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.features: { "tnum": 1 }
                                color: GritColors.fg2
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: Translation.tr("Running %1 · %2 so far")
                                    .arg(Core.fmtSpan(Core.subStartDay(subCard.modelData), GritStore.today))
                                    .arg(root.eur(root.subs.spentOn(subCard.modelData)))
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: GritColors.fg3
                                elide: Text.ElideRight
                            }
                        }
                        // When it charges next; white when it is three days
                        // away or closer.
                        IrisChip {
                            readonly property string dueText: {
                                const s = subCard.modelData;
                                if (subCard.nextDay === "")
                                    return "";
                                // A trial that does not convert has no next
                                // charge, only a last day, and calling that
                                // "next" reads as a bill.
                                const expires = s.cycle === "trial"
                                    && (!s.trialThen || s.trialThen === "none");
                                return (expires ? Translation.tr("ends %1") : Translation.tr("next %1"))
                                    .arg(root.subs.untilLabel(subCard.nextDay));
                            }
                            visible: dueText !== ""
                            text: dueText
                            on: subCard.dueSoon
                        }
                        IrisDisc {
                            size: UiScale.px(30)
                            clickable: true
                            icon: "edit"
                            tip: Translation.tr("Edit")
                            onClicked: root.beginEdit(subCard.modelData)
                        }
                        IrisDisc {
                            size: UiScale.px(30)
                            clickable: true
                            icon: "cancel"
                            tip: Translation.tr("Cancel subscription")
                            onClicked: {
                                const s = subCard.modelData;
                                GritConfirm.ask(
                                    Translation.tr("Cancel %1?").arg(s.name),
                                    Translation.tr("It moves to history. %1 spent over %2.")
                                        .arg(root.eur(root.subs.spentOn(s)))
                                        .arg(Core.fmtSpan(Core.subStartDay(s), GritStore.today)),
                                    () => GritStore.cancelSubscription(s.id),
                                    Translation.tr("Cancel it"));
                            }
                        }
                    }
                }
            }

            IrisText {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(12)
                horizontalAlignment: Text.AlignHCenter
                visible: root.subs.all.length === 0
                text: Translation.tr("Nothing tracked yet. Add the first one above.")
                font.pixelSize: Appearance.font.pixelSize.small
                color: GritColors.fg3
            }

            // ================ Charge history ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.subs.all.length > 0
                icon: "bar_chart"
                text: Translation.tr("What was charged")
            }

            IrisSegmented {
                visible: root.subs.all.length > 0
                onBlack: true
                value: root.subs.mode
                onSelected: v => {
                    root.subs.mode = v;
                    if (root.subs.anchorDay > GritStore.today)
                        root.subs.anchorDay = GritStore.today;
                }
                options: [
                    { label: Translation.tr("Day"), value: "day" },
                    { label: Translation.tr("Week"), value: "week" },
                    { label: Translation.tr("Month"), value: "month" },
                    { label: Translation.tr("Year"), value: "year" },
                    { label: Translation.tr("Total"), value: "total" }
                ]
            }

            RowLayout {
                Layout.fillWidth: true
                visible: root.subs.all.length > 0
                spacing: UiScale.px(6)

                IrisDisc {
                    icon: "chevron_left"
                    size: UiScale.px(34)
                    clickable: true
                    enabled: root.subs.canGoPrev
                    onClicked: root.subs.shift(-1)
                }
                IrisText {
                    Layout.preferredWidth: UiScale.px(150)
                    horizontalAlignment: Text.AlignHCenter
                    text: root.rangeTitle
                    font.pixelSize: Appearance.font.pixelSize.normal
                    font.weight: Font.DemiBold
                    color: GritColors.fg
                }
                IrisDisc {
                    icon: "chevron_right"
                    size: UiScale.px(34)
                    clickable: true
                    enabled: root.subs.canGoNext
                    onClicked: root.subs.shift(1)
                }
                Item { Layout.fillWidth: true }
                IrisText {
                    Layout.rightMargin: UiScale.px(4)
                    text: root.eur(root.subs.chargedInRangeEur)
                    font.pixelSize: Appearance.font.pixelSize.large
                    font.features: { "tnum": 1 }
                    font.weight: Font.ExtraBold
                    color: GritColors.fg
                }
            }

            IrisCard {
                id: chartCard
                visible: root.subs.all.length > 0
                implicitHeight: UiScale.px(170)
                fill: true

                Item {
                Layout.fillWidth: true
                Layout.fillHeight: true

                IrisText {
                    anchors.centerIn: parent
                    visible: root.subs.chargesInRange.length === 0
                    text: Translation.tr("No charges in this period.")
                    font.pixelSize: Appearance.font.pixelSize.small
                    color: GritColors.fg3
                }

                RowLayout {
                    anchors.fill: parent
                    spacing: root.subs.timeline.length > 12 ? UiScale.px(2) : UiScale.px(6)

                    Repeater {
                        model: root.subs.timeline
                        delegate: ColumnLayout {
                            id: barColumn
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            spacing: UiScale.px(4)

                            readonly property var segments: root.barSegments(barColumn.modelData.perService)
                            readonly property bool bucketHovered: root.hoverBucket === barColumn.index

                            IrisText {
                                Layout.alignment: Qt.AlignHCenter
                                visible: barColumn.modelData.total > 0 && root.subs.timeline.length <= 8
                                text: root.shortEur(barColumn.modelData.total)
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                font.features: { "tnum": 1 }
                                font.weight: Font.DemiBold
                                color: barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                                Behavior on color {
                                    ColorAnimation { duration: Iris.colorDuration }
                                }
                            }
                            // The well track is the full column; the stacked
                            // charges grow up from its bottom.
                            Rectangle {
                                id: barTrack
                                Layout.alignment: Qt.AlignHCenter
                                Layout.fillHeight: true
                                Layout.preferredWidth: Math.min(UiScale.px(24), Math.max(UiScale.px(5), UiScale.px(300) / Math.max(1, root.subs.timeline.length)))
                                radius: Math.min(width / 2, UiScale.px(8))
                                color: GritColors.well
                                opacity: root.hoverBucket >= 0 && !barColumn.bucketHovered ? 0.5 : 1

                                Behavior on opacity {
                                    NumberAnimation { duration: 160 }
                                }

                                ClippingRectangle {
                                    id: barRect
                                    anchors.bottom: parent.bottom
                                    width: parent.width
                                    // min() guards the frame where the model and chartMax
                                    // update in different orders and the ratio spikes
                                    height: barColumn.modelData.total > 0
                                        ? Math.max(UiScale.px(4), parent.height * Math.min(1, (barColumn.modelData?.total ?? 0) / root.subs.chartMax))
                                        : 0
                                    radius: parent.radius
                                    color: "transparent"

                                    Behavior on height {
                                        SpringAnimation { spring: 2.4; damping: 0.4; epsilon: 0.3 }
                                    }

                                    Column {
                                        anchors.fill: parent

                                        Repeater {
                                            model: barColumn.segments
                                            delegate: Rectangle {
                                                required property var modelData
                                                width: barRect.width
                                                height: barRect.height * ((modelData?.value ?? 0) / Math.max(1, barColumn.modelData?.total ?? 1))
                                                color: modelData.color
                                            }
                                        }
                                    }
                                }

                                HoverHandler {
                                    id: barHover
                                    onHoveredChanged: {
                                        if (hovered)
                                            root.hoverBucket = barColumn.index;
                                        else if (root.hoverBucket === barColumn.index)
                                            root.hoverBucket = -1;
                                    }
                                }

                                // The bucket's total, then one line per service
                                IrisToolTip {
                                    alternativeVisibleCondition: barHover.hovered
                                    text: barColumn.segments.length === 0 ? ""
                                        : [`${barColumn.modelData.label} · ${root.eur(barColumn.modelData.total)}`]
                                            .concat(barColumn.segments.map(s => `${s.name === "__other" ? Translation.tr("Other") : s.name}  ${root.eur(s.value)}`))
                                            .join("\n")
                                }
                            }
                            IrisText {
                                Layout.alignment: Qt.AlignHCenter
                                text: barColumn.modelData.tick ? barColumn.modelData.label : ""
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: barColumn.bucketHovered ? GritColors.fg : GritColors.fg3
                            }
                        }
                    }
                }

                }
            }

            // ================ Share of the monthly bill ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.subs.byService.length > 0
                icon: "donut_small"
                text: Translation.tr("Share of the bill")
                side: Translation.tr("Every cycle normalised to a month")
            }

            IrisCard {
                visible: root.subs.byService.length > 0
                spacing: UiScale.px(8)

                    IrisPie {
                        id: servicePie
                        Layout.alignment: Qt.AlignHCenter
                        model: root.subs.byService
                        centerText: root.shortEur(root.subs.monthlyEur)
                        centerCaption: Translation.tr("a month")
                        valueFormatter: v => root.eur(v)
                    }

                    // One slot per service: the fill is its share of the
                    // biggest, the disc and name sit inside, the price right.
                    Repeater {
                        model: root.subs.byService
                        delegate: Item {
                            id: legendRow
                            required property var modelData
                            required property int index
                            readonly property bool hovered: servicePie.hoveredIndex === legendRow.index
                            Layout.fillWidth: true
                            implicitHeight: UiScale.px(40)

                            Rectangle {
                                anchors.fill: parent
                                radius: height / 2
                                color: GritColors.well

                                Rectangle {
                                    height: parent.height
                                    width: Math.max(parent.height, parent.width * (legendRow.modelData?.value ?? 0)
                                        / Math.max(0.01, root.subs.byService[0]?.value ?? 1))
                                    radius: height / 2
                                    color: legendRow.hovered ? GritColors.raisedActive : GritColors.raisedHover
                                    Behavior on width {
                                        SpringAnimation { spring: 2.6; damping: 0.4; epsilon: 0.3 }
                                    }
                                    Behavior on color {
                                        ColorAnimation { duration: Iris.colorDuration }
                                    }
                                }
                            }
                            HoverHandler {
                                onHoveredChanged: servicePie.hoveredIndex = hovered ? legendRow.index : -1
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: UiScale.px(6)
                                anchors.rightMargin: UiScale.px(16)
                                spacing: UiScale.px(10)

                                IrisDisc {
                                    size: UiScale.px(28)
                                    icon: "autorenew"
                                    on: legendRow.hovered
                                }
                                IrisText {
                                    Layout.fillWidth: true
                                    text: legendRow.modelData.label
                                    font.pixelSize: Appearance.font.pixelSize.small
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                    elide: Text.ElideRight
                                }
                                Rectangle {
                                    implicitWidth: UiScale.px(10)
                                    implicitHeight: UiScale.px(10)
                                    radius: width / 2
                                    color: servicePie.seriesColors[legendRow.index % servicePie.seriesColors.length]
                                }
                                IrisText {
                                    text: Translation.tr("%1/mo").arg(root.eur(legendRow.modelData.value))
                                    font.pixelSize: Appearance.font.pixelSize.smaller
                                    font.features: { "tnum": 1 }
                                    color: GritColors.fg2
                                }
                                IrisText {
                                    Layout.preferredWidth: UiScale.px(40)
                                    horizontalAlignment: Text.AlignRight
                                    text: `${Math.round(legendRow.modelData.value / Math.max(0.01, root.subs.monthlyEur) * 100)}%`
                                    font.pixelSize: Appearance.font.pixelSize.smaller
                                    font.features: { "tnum": 1 }
                                    font.weight: Font.DemiBold
                                    color: GritColors.fg
                                }
                            }
                        }
                    }
            }

            // ================ History ================

            IrisSectionLabel {
                Layout.fillWidth: true
                Layout.topMargin: UiScale.px(6)
                visible: root.subs.cancelled.length > 0
                icon: "history"
                text: Translation.tr("Cancelled")
                side: Translation.tr("%1 spent on these before you cut them")
                    .arg(root.eur(root.subs.spentCancelledEur))
            }

            Repeater {
                model: root.subs.cancelled
                delegate: Rectangle {
                    id: histCard
                    required property var modelData
                    Layout.fillWidth: true
                    implicitHeight: Math.max(UiScale.px(60), histRow.implicitHeight + UiScale.px(20))
                    radius: UiScale.px(20)
                    color: histHover.hovered ? GritColors.raisedHover : GritColors.raised
                    // Dimmed: history, not a live charge
                    opacity: histHover.hovered ? 0.9 : 0.6

                    Behavior on color {
                        ColorAnimation { duration: Iris.colorDuration }
                    }
                    Behavior on opacity {
                        NumberAnimation { duration: 160 }
                    }

                    HoverHandler { id: histHover }

                    RowLayout {
                        id: histRow
                        anchors {
                            left: parent.left
                            right: parent.right
                            verticalCenter: parent.verticalCenter
                            leftMargin: UiScale.px(12)
                            rightMargin: UiScale.px(10)
                        }
                        spacing: UiScale.px(10)

                        IrisDisc {
                            size: UiScale.px(36)
                            icon: "block"
                            tone: "well"
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 0

                            IrisText {
                                Layout.fillWidth: true
                                text: histCard.modelData.name || Translation.tr("Untitled")
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.weight: Font.DemiBold
                                font.strikeout: true
                                color: GritColors.fg2
                                elide: Text.ElideRight
                            }
                            IrisText {
                                Layout.fillWidth: true
                                text: {
                                    const s = histCard.modelData;
                                    const from = Core.subStartDay(s);
                                    const to = s.cancelledOn ?? GritStore.today;
                                    return Translation.tr("Held %1 · %2 to %3")
                                        .arg(Core.fmtSpan(from, to))
                                        .arg(Core.fmtDay(from))
                                        .arg(Core.fmtDay(to));
                                }
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: GritColors.fg3
                                elide: Text.ElideRight
                            }
                        }
                        ColumnLayout {
                            Layout.alignment: Qt.AlignRight
                            spacing: 0

                            IrisText {
                                Layout.alignment: Qt.AlignRight
                                text: root.eur(root.subs.spentOn(histCard.modelData))
                                font.pixelSize: Appearance.font.pixelSize.small
                                font.features: { "tnum": 1 }
                                font.weight: Font.Bold
                                color: GritColors.fg
                            }
                            IrisText {
                                Layout.alignment: Qt.AlignRight
                                text: Translation.tr("total spent")
                                font.pixelSize: Appearance.font.pixelSize.smallest
                                color: GritColors.fg3
                            }
                        }
                        IrisDisc {
                            size: UiScale.px(30)
                            clickable: true
                            icon: "restart_alt"
                            tip: Translation.tr("Resubscribe")
                            onClicked: GritStore.resumeSubscription(histCard.modelData.id)
                        }
                        IrisDisc {
                            size: UiScale.px(30)
                            clickable: true
                            icon: "close"
                            tip: Translation.tr("Delete")
                            onClicked: {
                                const s = histCard.modelData;
                                GritConfirm.ask(
                                    Translation.tr("Delete %1?").arg(s.name),
                                    Translation.tr("Removes it from history for good."),
                                    () => GritStore.deleteSubscription(s.id));
                            }
                        }
                    }
                }
            }

            Item { implicitHeight: UiScale.px(4) }
        }
    }


    // ---------------- Start-date picker ----------------

    IrisDatePicker {
        id: datePicker
        selectedDay: root.draftStart
        maxDay: GritStore.today
        onPicked: day => {
            root.draftStart = day;
            root.draftStartSet = true;
            datePicker.close();
        }
    }
}
