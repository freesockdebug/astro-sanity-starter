// src/config/adminNavigation.ts
// Single Source of Truth for Admin Menus, Navigation Groups & Monochrome SVG Icons

export const MENU_SVGS: Record<string, string> = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  orders: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  products: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  pages: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  cms_config: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  cache: 'M13 10V3L4 14h7v7l9-11h-7z',
  members: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  roles: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  dicts: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  waf: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M13 8l-3 5h4l-3 5',
  logins: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  logs: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

export interface AdminMenuItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  desc: string;
  showPendingBadge?: boolean;
}

export interface AdminMenuGroup {
  groupTitle: string;
  items: AdminMenuItem[];
}

export interface AdminPermissionItem {
  key: string;
  label: string;
}

export interface AdminPermissionGroup {
  groupTitle: string;
  items: AdminPermissionItem[];
}

export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  {
    groupTitle: 'Overview',
    items: [
      {
        key: 'dashboard',
        label: 'Business Overview',
        href: '/admin/dashboard',
        icon: '📊',
        desc: 'KPIs, real-time funnel, operations telemetry & SLA health',
      },
    ],
  },
  {
    groupTitle: 'Operations',
    items: [
      {
        key: 'orders',
        label: 'Orders & Fulfillment',
        href: '/admin/orders',
        icon: '📦',
        desc: 'B2B inquiry triage, approval pipeline, airway bill & tracking dispatch',
        showPendingBadge: true,
      },
      {
        key: 'users',
        label: 'Customers & CRM',
        href: '/admin/users',
        icon: '👥',
        desc: 'Buyer CRM directory, VIP pricing tiers, rep allocation & security status',
      },
    ],
  },
  {
    groupTitle: 'Content & Catalog',
    items: [
      {
        key: 'products',
        label: 'Products & Catalog',
        href: '/admin/products',
        icon: '🛍️',
        desc: 'Multilingual styles, wholesale pricing tiers, color swatches & categories',
      },
      {
        key: 'pages',
        label: 'Pages & Builder',
        href: '/admin/pages',
        icon: '📄',
        desc: 'Modular section builder, landing pages & live responsive preview',
      },
      {
        key: 'cms_config',
        label: 'CMS Config',
        href: '/admin/cms-config',
        icon: '🎨',
        desc: 'Global navigation, header banner, promise badges & RFQ quote cart copy',
      },
      {
        key: 'cache',
        label: 'Cache Purge',
        href: '/admin/cache',
        icon: '⚡',
        desc: 'Cloudflare HTML edge cache purge & L2 KV multi-tier invalidation',
      },
    ],
  },
  {
    groupTitle: 'Access & RBAC',
    items: [
      {
        key: 'members',
        label: 'Team Members',
        href: '/admin/members',
        icon: '🧑‍💼',
        desc: 'Internal operators, Logto account bindings & sales rep allocations',
      },
      {
        key: 'roles',
        label: 'Roles & Permissions',
        href: '/admin/roles',
        icon: '🔐',
        desc: 'Visual RBAC access matrix, data scopes & granular functional grants',
      },
    ],
  },
  {
    groupTitle: 'Security & Audit',
    items: [
      {
        key: 'waf',
        label: 'Edge WAF Shield',
        href: '/admin/waf',
        icon: '🛡️',
        desc: 'Malicious IP blocking, strict rate limiting, bot challenge & live intercept telemetry',
      },
      {
        key: 'logins',
        label: 'Login Audit Logs',
        href: '/admin/logins',
        icon: '🛡️',
        desc: 'Operator login history, IP geolocations & operational diff timeline',
      },
      {
        key: 'logs',
        label: 'System Diagnostics',
        href: '/admin/logs',
        icon: '🩺',
        desc: 'Serverless runtime errors, Web Vitals, API bottlenecks & SLA profiling',
      },
    ],
  },
  {
    groupTitle: 'Configuration',
    items: [
      {
        key: 'dicts',
        label: 'Data Dictionaries',
        href: '/admin/dicts',
        icon: '🏷️',
        desc: 'Carriers, quick replies, buyer tags, currencies, units & system constants',
      },
      {
        key: 'settings',
        label: 'Workspace Settings',
        href: '/admin/settings',
        icon: '⚙️',
        desc: 'Brand profile, co-admins, webhook endpoints, email & platform health',
      },
    ],
  },
];

export const ADMIN_PERMISSION_GROUPS: AdminPermissionGroup[] = [
  {
    groupTitle: 'Overview & Dictionaries',
    items: [
      { key: 'dashboard:read', label: 'dashboard:read · View executive KPIs & funnel overview' },
      { key: 'dicts:read', label: 'dicts:read · View system dictionary lists' },
      { key: 'dicts:manage', label: 'dicts:manage · Edit carriers, templates, currencies & units' },
    ],
  },
  {
    groupTitle: 'Orders & Fulfillment',
    items: [
      { key: 'orders:read', label: 'orders:read · View orders & RFQ inquiries' },
      { key: 'orders:claim', label: 'orders:claim · Claim unassigned pool inquiries' },
      { key: 'orders:approve', label: 'orders:approve · Approve or reject quotes & orders' },
      { key: 'orders:ship', label: 'orders:ship · Enter tracking numbers & dispatch' },
      { key: 'orders:assign', label: 'orders:assign · Assign or reassign orders to reps' },
      { key: 'orders:export', label: 'orders:export · Export orders to CSV' },
    ],
  },
  {
    groupTitle: 'Customers & CRM',
    items: [
      { key: 'users:read', label: 'users:read · View buyer CRM directory & profiles' },
      { key: 'users:edit_tier', label: 'users:edit_tier · Update buyer pricing tier (STANDARD/VIP/PARTNER)' },
      { key: 'users:assign', label: 'users:assign · Assign dedicated sales rep to buyers' },
      { key: 'users:block', label: 'users:block · Block or unblock buyer accounts' },
    ],
  },
  {
    groupTitle: 'Content & CMS (Sanity)',
    items: [
      { key: 'cms:read', label: 'cms:read · View catalog, categories, pages & copy' },
      { key: 'cms:write', label: 'cms:write · Create & edit products, tiers & page sections' },
      { key: 'cms:delete', label: 'cms:delete · Delete products, categories & pages' },
      { key: 'cache:purge', label: 'cache:purge · Purge Cloudflare edge & KV caches' },
    ],
  },
  {
    groupTitle: 'Team, Audit & System',
    items: [
      { key: 'members:manage', label: 'members:manage · Add/remove team members & roles' },
      { key: 'roles:manage', label: 'roles:manage · Configure custom roles & permission matrix' },
      { key: 'waf:read', label: 'waf:read · View Edge WAF rules & intercepted attack logs' },
      { key: 'waf:manage', label: 'waf:manage · Toggle WAF modes & edit IP blacklists' },
      { key: 'logins:read', label: 'logins:read · View login audit trail & change diffs' },
      { key: 'logs:read', label: 'logs:read · View runtime diagnostics & latency logs' },
      { key: 'settings:manage', label: 'settings:manage · Edit brand, theme, webhook & system config' },
    ],
  },
];

// Flat lists & helpers
export const ALL_MENU_KEYS: string[] = ADMIN_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export function getAllMenuItems(): AdminMenuItem[] {
  return ADMIN_MENU_GROUPS.flatMap((g) => g.items);
}

const MENU_MAP = new Map<string, AdminMenuItem>(getAllMenuItems().map((item) => [item.key, item]));

export function getTabTitle(key: string, fallback = 'Workspace'): string {
  return MENU_MAP.get(key)?.label || fallback;
}

