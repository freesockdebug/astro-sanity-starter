import { persistentAtom } from '@nanostores/persistent';

export interface QuoteItem {
  id: string;        // Product ID or slug
  title: string;     // Product title
  sku: string;       // Style SKU
  imageUrl: string;  // Thumbnail URL
  variant: string;   // Color or style variant, e.g. "Champagne Nude"
  quantity: number;  // Desired quotation quantity
  moq?: string;      // Minimum order quantity, e.g. "200 Pairs"
  priceTier?: string;
}

// Persist quote cart in localStorage under key 'b2b_quote_cart'
export const quoteCart = persistentAtom<QuoteItem[]>('b2b_quote_cart', [], {
  encode: JSON.stringify,
  decode: (str) => {
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  },
});

// Helper to add or increment item in quote cart
export function addToQuote(item: QuoteItem) {
  const current = quoteCart.get() || [];
  const existingIndex = current.findIndex(
    (i) => i.id === item.id && i.variant === item.variant
  );

  if (existingIndex > -1) {
    const updated = [...current];
    updated[existingIndex].quantity += item.quantity;
    quoteCart.set(updated);
  } else {
    quoteCart.set([...current, item]);
  }
}

// Update item quantity
export function updateQuoteQuantity(id: string, variant: string, quantity: number) {
  const current = quoteCart.get() || [];
  if (quantity <= 0) {
    removeFromQuote(id, variant);
    return;
  }
  const updated = current.map((item) => {
    if (item.id === id && item.variant === variant) {
      return { ...item, quantity };
    }
    return item;
  });
  quoteCart.set(updated);
}

// Remove item from quote
export function removeFromQuote(id: string, variant: string) {
  const current = quoteCart.get() || [];
  quoteCart.set(current.filter((i) => !(i.id === id && i.variant === variant)));
}

// Clear entire quote cart
export function clearQuote() {
  quoteCart.set([]);
}

// Get total count of items in quote
export function getQuoteTotalCount(): number {
  const current = quoteCart.get() || [];
  return current.reduce((sum, item) => sum + item.quantity, 0);
}
