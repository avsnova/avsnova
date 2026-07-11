import MarketplaceView from "./MarketplaceView";

interface PhysicalSIMViewProps {
  walletBalance: number;
  orders: any[];
  onRefreshLedger?: () => void;
  onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system" | "service") => void;
  onSelectSection?: (section: string) => void;
  userName?: string | null;
  userEmail?: string | null;
}

/**
 * Dedicated Physical SIM page. Reuses the entire Marketplace module (same layout,
 * cards, category pills, modals, checkout, responsiveness, typography and
 * animations) scoped to products whose admin-assigned Display Location is
 * "Physical SIM". Only the data and hero copy change.
 */
export default function PhysicalSIMView(props: PhysicalSIMViewProps) {
  return <MarketplaceView {...props} scope="physical-sim" />;
}
