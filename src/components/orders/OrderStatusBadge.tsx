import {
  Ban, RotateCcw, AlertTriangle, CheckCircle2, ShieldQuestion, PackageCheck,
  Hourglass, Loader, Wallet, Clock, type LucideIcon,
} from "lucide-react";
import { Badge } from "../ui/shadcn";
import { orderStatusMeta } from "./orderTracking";

const ICONS: Record<string, LucideIcon> = {
  Ban, RotateCcw, AlertTriangle, CheckCircle2, ShieldQuestion, PackageCheck, Hourglass, Loader, Wallet, Clock,
};

// Unified status badge used across Marketplace, Gift, Inventory, SMM order lists.
export default function OrderStatusBadge({ status, hasCredentials, className }: { status: string; hasCredentials?: boolean; className?: string }) {
  const meta = orderStatusMeta(status, hasCredentials);
  const Icon = ICONS[meta.icon] || Clock;
  const spin = meta.icon === "Loader";
  return (
    <Badge variant={meta.tone} className={className}>
      <Icon className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} />
      {meta.label}
    </Badge>
  );
}
