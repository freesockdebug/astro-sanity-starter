// src/db/adminDtos.ts
// Shared DTO contracts for Admin Workbench API responses

export type AdminOrderStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'SHIPPED' | 'REJECTED' | 'ALL';

export interface AdminOrderListItem {
  id: string;
  order_no: string;
  buyer_email: string;
  company_name?: string;
  contact_name?: string;
  destination_country?: string;
  status: AdminOrderStatus;
  assigned_to?: string;
  inquiry_type?: string;
  total_quantity?: number;
  total_styles?: number;
  created_at: string;
  items?: Array<{
    title?: string;
    sku?: string;
    variant_title?: string;
    quantity?: number;
    price?: number;
  }>;
}

export interface AdminOrdersApiResponse {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    all: number;
    pending: number;
    approved: number;
    shipped: number;
    rejected: number;
  };
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name?: string;
  company?: string;
  country?: string;
  tier: string;
  status: 'ACTIVE' | 'BLOCKED';
  assigned_to?: string;
  orders_count?: number;
  created_at: string;
}

export interface AdminUsersApiResponse {
  users: AdminUserListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    all: number;
    vip?: number;
    partner?: number;
    unclaimedGuestOrders?: number;
    blocked?: number;
  };
}

