import {
  Flame,
  Skull,
  Sparkles,
  Mountain,
  Check,
  Plus,
  Star,
  Sun,
  X,
  Volume2,
  VolumeX,
  Trophy,
  Shield,
  Trash2,
  ChevronRight,
  Zap,
  ListChecks,
  Menu,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  Flame,
  Skull,
  Sparkles,
  Mountain,
  Check,
  Plus,
  Star,
  Sun,
  X,
  Volume2,
  VolumeX,
  Trophy,
  Shield,
  Trash2,
  ChevronRight,
  Zap,
  ListChecks,
  Menu,
};

export function Icon({
  name,
  className,
  strokeWidth = 2.4,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Cmp = MAP[name] ?? Sparkles;
  return <Cmp className={className} strokeWidth={strokeWidth} aria-hidden />;
}
