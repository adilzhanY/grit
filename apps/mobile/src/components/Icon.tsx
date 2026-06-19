/** Icon wrapper over lucide-react-native, name-mapped like the web Icon. */
import {
  BellRing,
  BookOpen,
  BookmarkCheck,
  BookmarkPlus,
  Beef,
  Cake,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Droplets,
  Flame,
  Footprints,
  Gauge,
  ListChecks,
  ListPlus,
  Moon,
  Mountain,
  NotebookPen,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Ruler,
  Save,
  Scale,
  Shield,
  Skull,
  Sparkles,
  Star,
  Sun,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trash2,
  Trophy,
  UserCircle,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { C } from "../theme";

const MAP: Record<string, LucideIcon> = {
  BellRing, BookOpen, BookmarkCheck, BookmarkPlus, Beef, Cake, CalendarCheck, CalendarClock, CalendarDays, ChartColumn,
  Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Clock, Coffee, Droplets, Flame, Footprints,
  Gauge, ListChecks, ListPlus, Moon, Mountain, NotebookPen, Pause, Pencil, Play, Plus,
  Repeat, Ruler, Save, Scale, Shield, Skull, Sparkles, Star, Sun, Target, Timer, TrendingDown,
  TrendingUp, Trash2, Trophy, UserCircle, Wheat, X,
};

export function Icon({
  name,
  size = 20,
  color = C.ink,
  strokeWidth = 2.4,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const Cmp = MAP[name] ?? Sparkles;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
}
