// src/config/adminNavigation.ts
// Single Source of Truth for Admin Menus, Navigation Groups & Granular RBAC Permissions

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
    groupTitle: '📊 Overview & Dictionaries',
    items: [
      { key: 'dashboard:read', label: 'dashboard:read (查看经营概览与KPI看板)' },
      { key: 'dicts:read', label: 'dicts:read (查看数据字典列表)' },
      { key: 'dicts:manage', label: 'dicts:manage (增删改承运商/话术/币种/单位)' },
    ],
  },
  {
    groupTitle: '📦 Orders & Fulfillment',
    items: [
      { key: 'orders:read', label: 'orders:read (查看订单与询盘列表)' },
      { key: 'orders:claim', label: 'orders:claim (公海询盘认领为专属客户)' },
      { key: 'orders:approve', label: 'orders:approve (审批报价/接受或驳回询盘)' },
      { key: 'orders:ship', label: 'orders:ship (物流填单与运单号发货)' },
      { key: 'orders:assign', label: 'orders:assign (跨业务员指派与询盘转派)' },
      { key: 'orders:export', label: 'orders:export (批量导出订单与询盘数据 CSV)' },
    ],
  },
  {
    groupTitle: '👥 Customers & CRM',
    items: [
      { key: 'users:read', label: 'users:read (查看客户列表与跟进详情)' },
      { key: 'users:edit_tier', label: 'users:edit_tier (调整客户等级 STANDARD/VIP/PARTNER)' },
      { key: 'users:assign', label: 'users:assign (指定或转移客户专属跟单业务员)' },
      { key: 'users:block', label: 'users:block (安全封禁或解封买家账号)' },
    ],
  },
  {
    groupTitle: '🛍️ Content & CMS (Sanity)',
    items: [
      { key: 'cms:read', label: 'cms:read (查看商品、分类、页面与全站文案配置)' },
      { key: 'cms:write', label: 'cms:write (新建/编辑商品、阶梯价、色卡与页面积木)' },
      { key: 'cms:delete', label: 'cms:delete (删除商品、产品分类或落地页文档)' },
      { key: 'cache:purge', label: 'cache:purge (手动清理 Cloudflare 边缘与 L2 KV 缓存)' },
    ],
  },
  {
    groupTitle: '🧑‍💼 Team, Audit & System',
    items: [
      { key: 'members:manage', label: 'members:manage (添加/解绑团队成员与指派角色)' },
      { key: 'roles:manage', label: 'roles:manage (创建/编辑自定义角色与配置权限矩阵)' },
      { key: 'logins:read', label: 'logins:read (查看员工与买家登录轨迹及操作 Diff 审计)' },
      { key: 'logs:read', label: 'logs:read (查看服务端异常排错与性能瓶颈诊断日志)' },
      { key: 'settings:manage', label: 'settings:manage (修改品牌参数、Webhook 与系统告警配置)' },
    ],
  },
];

// Flat lists & helpers
export const ALL_MENU_KEYS: string[] = ADMIN_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const ALL_PERMISSION_KEYS: string[] = ADMIN_PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export function getAllMenuItems(): AdminMenuItem[] {
  return ADMIN_MENU_GROUPS.flatMap((g) => g.items);
}

const MENU_MAP = new Map<string, AdminMenuItem>(getAllMenuItems().map((item) => [item.key, item]));

export function getMenuItem(key: string): AdminMenuItem | undefined {
  return MENU_MAP.get(key);
}

export function getTabTitle(key: string, fallback = 'Workspace'): string {
  return MENU_MAP.get(key)?.label || fallback;
}

export function getTabDescription(key: string, fallback = ''): string {
  return MENU_MAP.get(key)?.desc || fallback;
}

