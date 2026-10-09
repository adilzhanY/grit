import qs.services.grit
import QtQuick
import QtQuick.Layouts
import qs.modules.common

/**
 * The grit lockup: the Aperture mark beside the word, as one unit.
 *
 * It exists as its own component because the panel shows the brand in two
 * places (the head of the nav rail and the sign-in screen) and they must be
 * the same thing at two sizes, not two arrangements that drifted apart.
 *
 * The word is SF Pro Rounded Black: rounded terminals like the ones the mark is
 * drawn with, so the two halves read as one drawing. It is a plain Text on
 * purpose. StyledText always sets font.variableAxes, and any
 * variableAxes on a static family makes Qt ignore the weight and take the face
 * named "Regular", so the word would come out at book weight.
 *
 * Both halves take the Iris white (`fg`), which makes the lockup one object rather than
 * a mark next to a label.
 */
RowLayout {
    id: root

    /** Drives both halves, so the lockup scales as a unit. */
    property real size: UiScale.px(30)
    property color color: GritColors.fg

    spacing: Math.round(root.size * 0.28)

    GritLogo {
        size: root.size
        color: root.color
    }

    Text {
        text: "Grit"
        renderType: Appearance.font.renderType
        font.family: "SF Pro Rounded"
        font.weight: Font.Black
        // The mark's hexagon spans 84% of its box and a cap height is about
        // 72% of the type size, so 1.15x is what makes the word sit level with
        // the mark rather than looking small beside it.
        font.pixelSize: Math.round(root.size * 1.15)
        // Heavy weights need the tracking pulled back or the counters close up.
        font.letterSpacing: -root.size * 0.02
        color: root.color
    }
}
