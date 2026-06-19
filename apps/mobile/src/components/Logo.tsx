/**
 * The Grit brand mark as a crisp vector (react-native-svg) — no raster asset.
 * Mirrors assets/logo.svg. Use this anywhere the logo appears in-app; the app
 * icon / splash PNGs are generated from the same source.
 */
import Svg, { Path, Rect } from "react-native-svg";
import { C } from "../theme";

/** The monogram path, on a 0 0 400 400 canvas. */
const MARK =
  "m60 187.5 10.5-20.7 51.3 27.9v22.65l-51.3 27.9L60 222.9l37.65-17.25zm18.264 69h132V279h-132zm153.849-13.95h36V279h-36zm18 9.45q-32.7 0-52.65-5.7-19.95-5.85-29.1-17.1-9-11.4-9-28.2t9-28.05q9.15-11.4 29.1-17.1 19.95-5.85 52.65-5.85t52.65 5.85q19.95 5.7 28.95 17.1 9.15 11.25 9.15 28.05t-9.15 28.2q-9 11.25-28.95 17.1-19.95 5.7-52.65 5.7m0-28.5q15.45 0 26.7-1.8 11.25-1.95 17.4-6.75 6.15-4.95 6.15-13.95t-6.15-13.8q-6.15-4.95-17.4-6.75-11.25-1.95-26.7-1.95t-27.15 1.95q-11.55 1.8-18.15 6.75-6.45 4.8-6.45 13.8t6.45 13.95q6.6 4.8 18.15 6.75 11.7 1.8 27.15 1.8";

export function Logo({
  size = 96,
  color = C.ink,
  background,
}: {
  size?: number;
  /** Monogram colour. Defaults to the theme ink. */
  color?: string;
  /** Optional filled rounded tile behind the mark (e.g. a white chip). */
  background?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 400 400">
      {background ? <Rect width={400} height={400} rx={88} fill={background} /> : null}
      <Path fill={color} d={MARK} />
    </Svg>
  );
}
