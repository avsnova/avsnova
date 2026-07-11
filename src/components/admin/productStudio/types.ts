// Shared types & constants for the Product Management Studio wizard.

export interface StudioForm {
  id: string;
  name: string;
  productType: string;
  short_description: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  tags: string;
  sku: string;
  internal_notes: string;
  // media
  icon: string;             // cover / emoji
  multiple_images: string;  // gallery (comma-separated)
  youtube_url: string;
  // inventory
  stock: string;
  stockMode: "unlimited" | "quantity" | "credentials";
  // pricing
  price: string;
  sale_price: string;
  cost_price: string;
  markup: string;
  // delivery
  type: "digital" | "physical";
  delivery_type: "instant" | "manual" | "inquiry";
  delivery_estimate: string;
  warranty_period: string;
  replacement_policy: string;
  expiration: string;
  shipping_type: "local" | "international";
  delivery_countries: string;
  // variants
  variants: StudioVariant[];
  // seo
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  featured: number;
  newest: number;
  popular: number;
  // guides / specs
  setup_guide: string;
  custom_fields: string;
  specifications: string;
  related_products: string;
  status: string;    // "1" active / "0" inactive
  is_draft: number;  // 0/1
}

export interface StudioVariant {
  name: string;
  price: string;
  stock: string;
}

export const PRODUCT_TYPES: { id: string; label: string; icon: string; desc: string; delivery: StudioForm["delivery_type"]; type: StudioForm["type"] }[] = [
  { id: "digital_account", label: "Digital Account", icon: "user", desc: "Login credentials delivered from a credential pool (Facebook, Netflix, etc.)", delivery: "instant", type: "digital" },
  { id: "digital_key", label: "Digital Key", icon: "key", desc: "Serial keys / license codes delivered instantly", delivery: "instant", type: "digital" },
  { id: "subscription", label: "Subscription", icon: "refresh", desc: "Recurring or time-bound subscription services", delivery: "manual", type: "digital" },
  { id: "virtual_number", label: "Virtual Number", icon: "phone", desc: "Phone numbers for verification / calling", delivery: "manual", type: "digital" },
  { id: "vpn", label: "VPN", icon: "shield", desc: "VPN accounts and access profiles", delivery: "instant", type: "digital" },
  { id: "software", label: "Software", icon: "package", desc: "Software licenses & installers", delivery: "instant", type: "digital" },
  { id: "custom_service", label: "Custom Service", icon: "sparkles", desc: "Bespoke services quoted per request", delivery: "inquiry", type: "digital" },
  { id: "digital_download", label: "Digital Download", icon: "download", desc: "Downloadable files (e-books, assets, templates)", delivery: "instant", type: "digital" },
  { id: "other", label: "Other", icon: "box", desc: "Anything else — full manual control", delivery: "manual", type: "digital" },
];

export const STUDIO_STEPS = [
  "Product Type",
  "Basic Info",
  "Media",
  "Inventory",
  "Credentials",
  "Pricing",
  "Delivery",
  "Variants",
  "SEO",
  "Review & Publish",
] as const;

export const blankStudioForm = (): StudioForm => ({
  id: "", name: "", productType: "", short_description: "", description: "",
  category: "digital", subcategory: "", brand: "", tags: "", sku: "", internal_notes: "",
  icon: "📦", multiple_images: "", youtube_url: "",
  stock: "100", stockMode: "quantity",
  price: "", sale_price: "", cost_price: "", markup: "",
  type: "digital", delivery_type: "instant", delivery_estimate: "", warranty_period: "",
  replacement_policy: "", expiration: "", shipping_type: "local", delivery_countries: "",
  variants: [],
  seo_title: "", seo_description: "", seo_keywords: "", featured: 0, newest: 0, popular: 0,
  setup_guide: "", custom_fields: "", specifications: "", related_products: "",
  status: "1", is_draft: 0,
});
