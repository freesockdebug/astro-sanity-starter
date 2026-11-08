// src/utils/shipping.ts
// Carrier Tracking URL Resolution and B2B Quick Reply English Templates

export interface CarrierDictItem {
  id: string;
  name: string;
  urlTemplate: string;
}

export const DEFAULT_CARRIERS: CarrierDictItem[] = [
  {
    id: 'DHL',
    name: 'DHL Express',
    urlTemplate: 'https://www.dhl.com/en/express/tracking.html?AWB={tracking_no}',
  },
  {
    id: 'FedEx',
    name: 'FedEx',
    urlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={tracking_no}',
  },
  {
    id: 'UPS',
    name: 'UPS',
    urlTemplate: 'https://www.ups.com/track?tracknum={tracking_no}',
  },
  {
    id: 'SF Express',
    name: 'SF International (顺丰)',
    urlTemplate: 'https://www.sf-international.com/us/en/dynamic_function/waybill/#search/bill-number/{tracking_no}',
  },
  {
    id: 'EMS',
    name: 'EMS / China Post',
    urlTemplate: 'https://www.ems.com.cn/queryList?mailNum={tracking_no}',
  },
  {
    id: 'Other / Universal',
    name: '17TRACK Universal',
    urlTemplate: 'https://t.17track.net/en#nums={tracking_no}',
  },
];

export function getTrackingUrl(carrierName?: string, trackingNo?: string, customTemplate?: string): string | null {
  if (!trackingNo || !trackingNo.trim()) return null;
  const cleanNo = encodeURIComponent(trackingNo.trim());
  const cleanName = (carrierName || '').trim().toLowerCase();

  if (customTemplate && (customTemplate.includes('{tracking}') || customTemplate.includes('{tracking_no}'))) {
    return customTemplate.replace('{tracking_no}', cleanNo).replace('{tracking}', cleanNo);
  }

  const matched = DEFAULT_CARRIERS.find(
    (c) => c.id.toLowerCase() === cleanName || c.name.toLowerCase().includes(cleanName) || cleanName.includes(c.id.toLowerCase())
  );

  if (matched) {
    return matched.urlTemplate.replace('{tracking_no}', cleanNo).replace('{tracking}', cleanNo);
  }

  // Fallback to 17track universal
  return `https://t.17track.net/en#nums=${cleanNo}`;
}

export interface QuickReplyTemplate {
  id: string;
  category: 'approval' | 'shipping' | 'general';
  label: string;
  text: string;
}

export const QUICK_REPLY_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'sample_prod',
    category: 'approval',
    label: 'Sample in production (3 days)',
    text: 'Sample approved. Production has been scheduled and will dispatch in approx. 3 business days.',
  },
  {
    id: 'pi_sent',
    category: 'approval',
    label: 'Formal PI emailed',
    text: 'Order inquiry reviewed. The formal Proforma Invoice (PI) with factory pricing has been sent to your email.',
  },
  {
    id: 'tech_spec',
    category: 'approval',
    label: 'Spec check in progress',
    text: 'We are verifying yarn gauge and custom packaging specs with the master technician.',
  },
  {
    id: 'dispatched_air',
    category: 'shipping',
    label: 'Air express dispatched',
    text: 'Package dispatched via air express. Tracking details are updated above; delivery expected in 5-7 days.',
  },
  {
    id: 'customs_cleared',
    category: 'shipping',
    label: 'Export customs cleared',
    text: 'Export customs clearance complete. Flight departure scheduled for tonight.',
  },
];

