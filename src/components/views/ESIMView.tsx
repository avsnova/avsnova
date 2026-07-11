import MarketplaceView from "./MarketplaceView";

interface ESIMViewProps {
  walletBalance: number;
  orders: any[];
  onRefreshLedger?: () => void;
  onAddNotification?: (title: string, message: string, type: "security" | "payment" | "system" | "service") => void;
  onSelectSection?: (section: string) => void;
  userName?: string | null;
  userEmail?: string | null;
}

/**
 * Dedicated eSIM page. Reuses the entire Marketplace module (same layout, cards,
 * category pills, modals, checkout, responsiveness, typography and animations) but
 * scoped to products whose admin-assigned Display Location is "eSIM". Only the data
 * and hero copy change — everything else is the shared design system.
 */
export default function ESIMView(props: ESIMViewProps) {
  return <MarketplaceView {...props} scope="esim" />;
}
