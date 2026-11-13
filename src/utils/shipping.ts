// src/utils/shipping.ts
// Carrier Tracking URL Resolution (Single Source of Truth)

export interface CarrierDictItem {
  id: string;
  name: string;
  urlTemplate: string;
}

export interface CustomCarrierOption {
  id?: string;
  key?: string;
  name?: string;
  url?: string;
  urlTemplate?: string;
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

export function getTrackingUrl(
  carrierName?: string,
  trackingNo?: string,
  customTemplate?: string,
  customCarriers?: CustomCarrierOption[]
): string | null {
  if (!trackingNo || !trackingNo.trim()) return null;
  const cleanNo = encodeURIComponent(trackingNo.trim());
  const cleanName = (carrierName || '').trim().toLowerCase();

  if (customTemplate && (customTemplate.includes('{tracking}') || customTemplate.includes('{tracking_no}'))) {
    return customTemplate.replace('{tracking_no}', cleanNo).replace('{tracking}', cleanNo);
  }

  const pool: CustomCarrierOption[] = [...(customCarriers || []), ...DEFAULT_CARRIERS];
  const matched = pool.find((c) => {
    const keyOrId = (c.key || c.id || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    return (
      (keyOrId && (keyOrId === cleanName || cleanName.includes(keyOrId))) ||
      (name && (name === cleanName || name.includes(cleanName)))
    );
  });

  const tpl = matched?.url || matched?.urlTemplate;
  if (tpl) {
    return tpl.replace('{tracking_no}', cleanNo).replace('{tracking}', cleanNo);
  }

  // Fallback to 17track universal
  return `https://t.17track.net/en#nums=${cleanNo}`;
}

