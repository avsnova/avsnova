export interface Transaction {
  id: string;
  type: "deposit" | "purchase" | "refund";
  category: string;
  amount: number;
  status: "completed" | "processing" | "failed";
  date: string;
  description: string;
  reference: string;
}

export interface Order {
  id: string;
  service: string;
  category: "SMM Panel" | "Marketplace";
  amount: number;
  status: "completed" | "processing" | "failed" | "refunded";
  date: string;
  details: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "service" | "payment" | "refund" | "announcement";
  time: string;
  read: boolean;
}

export interface AIJob {
  id: string;
  type: "image" | "video";
  prompt: string;
  style?: string;
  date: string;
  cost: number;
  status: "completed" | "failed";
  resolution?: string;
  duration?: string;
}

export interface SMMService {
  id: string;
  name: string;
  platform: "Instagram" | "TikTok" | "YouTube" | "Twitter" | "Telegram";
  ratePer1k: number;
  minOrder: number;
  maxOrder: number;
  avgDelivery: string;
  isFavorite?: boolean;
}

export interface MarketplaceProduct {
  id: string;
  name: string;
  category: "Design" | "Development" | "Streaming" | "Gaming" | "Productivity";
  price: number;
  rating: number;
  sales: number;
  icon: string;
  description: string;
  instantDelivery: boolean;
}

// ——— PURE PRODUCTION DATA SLATE: NO PLACEHOLDERS OR DEMO RECORDS ———
export const MOCK_TRANSACTIONS: Transaction[] = [];
export const MOCK_ORDERS: Order[] = [];
export const MOCK_NOTIFICATIONS: NotificationItem[] = [];
export const MOCK_AI_JOBS: AIJob[] = [];
export const MOCK_VIRTUAL_NUMBERS: any[] = [];
export const MOCK_SMM_SERVICES: SMMService[] = [];
export const MOCK_MARKETPLACE_PRODUCTS: MarketplaceProduct[] = [];
export const MOCK_API_KEYS: any[] = [];
