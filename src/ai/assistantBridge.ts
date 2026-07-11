// ————————————————————————————————————————————————————————————————
//  Aurevashop AI — Assistant Bridge
// ————————————————————————————————————————————————————————————————
// Lets any component open the floating AI Assistant and (optionally) seed it with
// order context + a prefilled question, without prop-drilling. Uses a DOM
// CustomEvent so it works across the lazily-mounted assistant. No backend impact.

export interface AssistantOrderContext {
  orderId?: string | number;
  product?: string;
  quantity?: number;
  status?: string;         // human status label
  paymentStatus?: string;
  category?: string;
  amount?: number;
  timeSince?: string;
  /** Optional message to auto-send once the panel opens. */
  ask?: string;
}

const EVENT = "avs:open-assistant";

export function openAssistant(ctx?: AssistantOrderContext) {
  try {
    window.dispatchEvent(new CustomEvent<AssistantOrderContext>(EVENT, { detail: ctx || {} }));
  } catch { /* ignore (sandbox) */ }
}

export function onOpenAssistant(handler: (ctx: AssistantOrderContext) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<AssistantOrderContext>).detail || {});
  window.addEventListener(EVENT, listener as EventListener);
  return () => window.removeEventListener(EVENT, listener as EventListener);
}
