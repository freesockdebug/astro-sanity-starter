// src/db/types.ts
// Domain Types & Interfaces for GwenVenni B2B Data Layer

export type CustomerTier = 'STANDARD' | 'VIP' | 'PARTNER';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  company: string;
  country: string;
  phone: string;
  logto_roles: string;
  tier: CustomerTier;
  status: UserStatus;
  admin_notes: string;
  last_login_at: string;
  last_login_ip?: string;
  last_login_country?: string;
  created_at: string;
  updated_at: string;
  total_orders?: number;
  pending_orders?: number;
  shipped_orders?: number;
  latest_order_date?: string;
}

export interface LoginRecord {
  id?: number;
  user_id: string;
  email: string;
  ip: string;
  country: string;
  city: string;
  user_agent: string;
  created_at: string;
}

export interface OrderItem {
  id?: number;
  order_id?: string;
  product_id?: string;
  sku?: string;
  title: string;
  variant?: string;
  quantity: number;
  image_url?: string;
}

export type OrderStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'SHIPPED' | 'REJECTED';

export interface OrderRecord {
  id: string;
  order_no: string;
  user_id: string | null;
  buyer_email: string;
  company_name: string | null;
  contact_name: string | null;
  whatsapp: string | null;
  destination_country: string | null;
  customer_notes: string | null;
  inquiry_type: string;
  total_styles: number;
  total_quantity: number;
  status: OrderStatus;
  carrier: string | null;
  tracking_number: string | null;
  admin_remark: string | null;
  claimed_at: string | null;
  approved_at: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface CreateOrderInput {
  orderNo?: string;
  userId?: string | null;
  buyerEmail: string;
  companyName?: string;
  contactName?: string;
  whatsapp?: string;
  destinationCountry?: string;
  customerNotes?: string;
  inquiryType?: string;
  items: Array<{
    productId?: string;
    sku?: string;
    title: string;
    variant?: string;
    quantity: number;
    imageUrl?: string;
  }>;
}

export interface ListAdminOrdersFilter {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListAdminOrdersResult {
  orders: OrderRecord[];
  total: number;
  page: number;
  limit: number;
  stats: {
    all: number;
    pending: number;
    approved: number;
    shipped: number;
    rejected: number;
  };
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  carrier?: string;
  trackingNumber?: string;
  adminRemark?: string;
  adminUser?: string;
}

export interface ListAdminUsersFilter {
  search?: string;
  tier?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListAdminUsersResult {
  users: UserRecord[];
  total: number;
  page: number;
  limit: number;
  stats: {
    all: number;
    vip: number;
    partner: number;
    standard: number;
    blocked: number;
    unclaimedGuestOrders: number;
  };
}
