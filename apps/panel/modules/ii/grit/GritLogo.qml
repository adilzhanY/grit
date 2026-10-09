import qs.services.grit
import QtQuick
import QtQuick.Shapes
import qs.modules.common

/**
 * The grit mark, "Aperture", drawn as a shape rather than loaded as an image.
 *
 * Same geometry as `apps/mobile/assets/logo.svg`, which is the source of truth
 * for the mark: a hexagonal rim with six blades reaching in from the corners,
 * leaving the opening in the middle. Six separate things resolving into one
 * place.
 *
 * It is vector rather than a PNG so it stays sharp at any UiScale and takes its
 * colour from the theme, which means it follows a palette regeneration instead
 * of having to be re-exported.
 *
 * THE BLADES ARE ALWAYS THERE. An earlier version dropped them below 40 px
 * because six spokes and a rim closed up into a smudge, but a mark that loses
 * its inside is a different mark, and the rail showed a bare hexagon. What
 * shrinks instead is how FAR the blades reach: at small sizes they stop about
 * halfway to the centre rather than 71% of the way, which opens the middle back
 * up. Same drawing, more air.
 */
Item {
    id: root

    /** Rendered size in px. The mark is square. */
    property real size: UiScale.px(28)
    property color color: GritColors.fg

    implicitWidth: root.size
    implicitHeight: root.size

    // A stroke of 7 units on a 100-unit canvas is under 2 px at 26 px, so the
    // weight grows as the mark shrinks.
    readonly property real rimWidth: (root.size >= 56 ? 7 : root.size >= 36 ? 8 : 9) * root.size / 100
    readonly property real bladeWidth: (root.size >= 56 ? 6 : 6.5) * root.size / 100
    /**
     * How far each blade travels from its corner toward the centre, as a
     * fraction of that distance. 0.71 is the drawn mark; pulling it back to
     * 0.5 at small sizes doubles the opening.
     */
    readonly property real reach: root.size >= 56 ? 0.71 : root.size >= 36 ? 0.62 : 0.5

    /** Map the 0..100 design canvas onto the rendered size. */
    function u(v) {
        return v * root.size / 100;
    }

    /** The six corners of the rim, pointy top and bottom. */
    readonly property var corners: [
        [50, 8], [86.4, 29], [86.4, 71], [50, 92], [13.6, 71], [13.6, 29]
    ]

    /** Where blade `i` stops, `reach` of the way from its corner to the centre. */
    function bladeX(i) {
        return root.u(root.corners[i][0] + root.reach * (50 - root.corners[i][0]));
    }
    function bladeY(i) {
        return root.u(root.corners[i][1] + root.reach * (50 - root.corners[i][1]));
    }

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer

        // Rim
        ShapePath {
            strokeColor: root.color
            strokeWidth: root.rimWidth
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            startX: root.u(50); startY: root.u(8)
            PathLine { x: root.u(86.4); y: root.u(29) }
            PathLine { x: root.u(86.4); y: root.u(71) }
            PathLine { x: root.u(50);   y: root.u(92) }
            PathLine { x: root.u(13.6); y: root.u(71) }
            PathLine { x: root.u(13.6); y: root.u(29) }
            PathLine { x: root.u(50);   y: root.u(8) }
        }

        // Six blades, each its own subpath so the round caps land on both ends.
        ShapePath {
            strokeColor: root.color; strokeWidth: root.bladeWidth
            fillColor: "transparent"; capStyle: ShapePath.RoundCap
            startX: root.u(50); startY: root.u(8)
            PathLine { x: root.bladeX(0); y: root.bladeY(0) }
        }
        ShapePath {
            strokeColor: root.color; strokeWidth: root.bladeWidth
            fillColor: "transparent"; capStyle: ShapePath.RoundCap
            startX: root.u(86.4); startY: root.u(29)
            PathLine { x: root.bladeX(1); y: root.bladeY(1) }
        }
        ShapePath {
            strokeColor: root.color; strokeWidth: root.bladeWidth
            fillColor: "transparent"; capStyle: ShapePath.RoundCap
            startX: root.u(86.4); startY: root.u(71)
            PathLine { x: root.bladeX(2); y: root.bladeY(2) }
        }
        ShapePath {
            strokeColor: root.color; strokeWidth: root.bladeWidth
            fillColor: "transparent"; capStyle: ShapePath.RoundCap
            startX: root.u(50); startY: root.u(92)
            PathLine { x: root.bladeX(3); y: root.bladeY(3) }
        }
        ShapePath {
            strokeColor: root.color; strokeWidth: root.bladeWidth
            fillColor: "transparent"; capStyle: ShapePath.RoundCap
            startX: root.u(13.6); startY: root.u(71)
            PathLine { x: root.bladeX(4); y: root.bladeY(4) }
        }
        ShapePath {
            strokeColor: root.color; strokeWidth: root.bladeWidth
            fillColor: "transparent"; capStyle: ShapePath.RoundCap
            startX: root.u(13.6); startY: root.u(29)
            PathLine { x: root.bladeX(5); y: root.bladeY(5) }
        }
    }
}
