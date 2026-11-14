CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id TEXT,
  buyer_email TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  whatsapp TEXT,
  destination_country TEXT,
  customer_notes TEXT,
  inquiry_type TEXT DEFAULT 'quote_cart',
  total_styles INTEGER DEFAULT 0,
  total_quantity INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  carrier TEXT,
  tracking_number TEXT,
  admin_remark TEXT,
  claimed_at TEXT,
  approved_at TEXT,
  shipped_at TEXT,
  shipped_by TEXT,
  assigned_to TEXT DEFAULT NULL,
  assigned_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT,
  sku TEXT,
  title TEXT,
  variant TEXT,
  quantity INTEGER DEFAULT 1,
  image_url TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  country TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  logto_roles TEXT DEFAULT '[]',
  tier TEXT DEFAULT 'STANDARD',
  status TEXT DEFAULT 'ACTIVE',
  admin_notes TEXT DEFAULT '',
  assigned_to TEXT DEFAULT NULL,
  last_login_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  ip TEXT DEFAULT '',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS system_error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  error_code TEXT,
  message TEXT NOT NULL,
  context_json TEXT,
  user_id TEXT,
  user_email TEXT,
  ray_id TEXT,
  path TEXT,
  latency_ms INTEGER,
  method TEXT,
  status_code INTEGER,
  client_ip TEXT,
  country TEXT,
  city TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_roles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_scope TEXT NOT NULL DEFAULT 'ALL',
  menus_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_system INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_members (
  email TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  role_code TEXT NOT NULL DEFAULT 'sales_rep',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  diff_json TEXT,
  client_ip TEXT,
  country TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sys_dict_groups (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  meta_schema_json TEXT DEFAULT '[]',
  is_system INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sys_dict_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_code TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_label TEXT NOT NULL,
  badge_color TEXT DEFAULT 'slate',
  meta_json TEXT DEFAULT '{}',
  sort_order INTEGER DEFAULT 100,
  is_enabled INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_code, item_key)
);
INSERT OR IGNORE INTO admin_roles (code, name, data_scope, menus_json, permissions_json, description, is_system) VALUES
  ('super_admin', '超级管理员', 'ALL', '["dashboard","orders","users","products","pages","cms_config","cache","members","roles","dicts","logins","logs","settings"]', '["*"]', '全局最高权限，拥有全站所有操作及系统设置能力', 1),
  ('content_editor', '内容与美工运营', 'ALL', '["products","pages","cms_config","cache"]', '["cms:read","cms:write","cache:purge"]', '负责商品管理、分类维护、页面积木编排与边缘缓存刷新', 1),
  ('sales_manager', '销售主管', 'ALL', '["dashboard","orders","users","products","members","logins"]', '["dashboard:read","orders:read","orders:approve","orders:ship","orders:assign","orders:export","users:read","users:edit_tier","users:assign","members:manage","dicts:read","cms:read","cms:write","cache:purge"]', '负责团队管理、询盘指派调配、商品报价与客户等级管理', 1),
  ('sales_rep', '跟单业务员', 'SELF_AND_POOL', '["orders","users"]', '["orders:read","orders:claim","orders:approve","orders:ship","users:read"]', '负责跟单、询盘公海认领与常规发货审批', 1),
  ('auditor', '运维审计员', 'ALL', '["dashboard","logins","logs"]', '["dashboard:read","logins:read","logs:read"]', '只读查看登录轨迹与系统诊断日志，保障系统安全', 1);
UPDATE admin_roles SET menus_json = '["dashboard","orders","users","products","pages","cms_config","cache","members","roles","dicts","logins","logs","settings"]' WHERE code = 'super_admin' AND is_system = 1;
UPDATE admin_roles SET menus_json = '["dashboard","orders","users","products","members","logins"]' WHERE code = 'sales_manager' AND is_system = 1;
UPDATE admin_roles SET menus_json = '["dashboard","logins","logs"]' WHERE code = 'auditor' AND is_system = 1;
INSERT OR IGNORE INTO system_settings (key, value, updated_by) VALUES ('co_admin_emails', '', 'system_init');
INSERT OR IGNORE INTO sys_dict_groups (code, name, description, meta_schema_json, is_system) VALUES
  ('shipping_carriers', 'Shipping Carriers', 'Logistics couriers & tracking URL templates', '[{"key":"tracking_url","label":"Tracking URL Template","type":"text","placeholder":"https://...{tracking}"}]', 1),
  ('quick_replies', 'Quick Reply Templates', 'B2B multi-scene reply chips for order reviews', '[{"key":"scene","label":"Scene","type":"select","options":["approval","shipping","rejection"]},{"key":"content","label":"Template Text","type":"textarea"}]', 1),
  ('customer_tiers', 'Customer Tiers', 'B2B buyer pricing tiers and visual badge styling', '[{"key":"discount_label","label":"Discount Notice","type":"text"},{"key":"description","label":"Benefits Description","type":"text"}]', 1),
  ('customer_tags', 'Customer CRM Tags', 'Standard tags for buyer profiling and account classification', '[]', 1),
  ('inquiry_types', 'Inquiry Types', 'B2B order RFQ category badges and classifications', '[]', 1),
  ('order_statuses', 'Order Statuses', 'Fulfillment lifecycle statuses and SLA thresholds', '[{"key":"sla_hours","label":"SLA Threshold (Hours)","type":"number"}]', 1),
  ('audit_actions', 'Audit Actions', 'Security and operations audit action dictionary', '[{"key":"risk_level","label":"Risk Level","type":"select","options":["LOW","MEDIUM","HIGH"]}]', 1);
INSERT OR IGNORE INTO sys_dict_items (group_code, item_key, item_label, badge_color, meta_json, sort_order) VALUES
  ('shipping_carriers', 'dhl', 'DHL Express', 'amber', '{"tracking_url":"https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={tracking}"}', 10),
  ('shipping_carriers', 'fedex', 'FedEx', 'purple', '{"tracking_url":"https://www.fedex.com/fedextrack/?trknbr={tracking}"}', 20),
  ('shipping_carriers', 'ups', 'UPS', 'amber', '{"tracking_url":"https://www.ups.com/track?tracknum={tracking}"}', 30),
  ('shipping_carriers', 'sf_express', 'SF Express International', 'rose', '{"tracking_url":"https://www.sf-international.com/us/en/dynamic_function/waybill/#search/bill-number/{tracking}"}', 40),
  ('shipping_carriers', 'ems', 'EMS / China Post', 'emerald', '{"tracking_url":"https://www.ems.com.cn/queryList?mailNos={tracking}"}', 50),
  ('shipping_carriers', 'dhl_ecommerce', 'DHL eCommerce', 'amber', '{"tracking_url":"https://ecommerceportal.dhl.com/track/?trackingNumber={tracking}"}', 60),
  ('shipping_carriers', 'aramex', 'Aramex', 'rose', '{"tracking_url":"https://www.aramex.com/track/results?mode=0&ShipmentNumber={tracking}"}', 70),
  ('shipping_carriers', 'tnt', 'TNT', 'amber', '{"tracking_url":"https://www.tnt.com/express/en_gc/site/shipping-tools/tracking.html?searchType=CON&cons={tracking}"}', 80),

  ('quick_replies', 'sample_approved', 'Sample Approved', 'emerald', '{"scene":"approval","content":"Your sample swatch request has been verified and approved by our procurement team."}', 10),
  ('quick_replies', 'quote_approved', 'Bulk RFQ Confirmed', 'blue', '{"scene":"approval","content":"Your bulk purchase requisition has been confirmed. Factory production allocation reserved."}', 20),
  ('quick_replies', 'oem_approved', 'Custom Specs Accepted', 'purple', '{"scene":"approval","content":"Custom textile formulation review passed. Production schedule queued."}', 30),
  ('quick_replies', 'air_express_dispatched', 'Air Express Dispatched', 'emerald', '{"scene":"shipping","content":"Your consignment has been dispatched via international air express. Tracking number attached."}', 40),
  ('quick_replies', 'customs_docs_prepared', 'Customs Docs Ready', 'blue', '{"scene":"shipping","content":"Commercial invoice, packing list, and bill of lading (B/L) have been filed."}', 50),
  ('quick_replies', 'freight_loaded', 'Container Loaded', 'indigo', '{"scene":"shipping","content":"Goods have completed warehouse inspection and container stuffing. Awaiting vessel departure."}', 60),
  ('quick_replies', 'moq_not_met', 'MOQ Not Met', 'rose', '{"scene":"rejection","content":"Thank you for your inquiry. The requested yardage does not satisfy our minimum order quantity (MOQ). Please review our tiered volume requirements."}', 70),
  ('quick_replies', 'fabric_discontinued', 'Fabric Discontinued', 'rose', '{"scene":"rejection","content":"We regret to inform you that this specific fabric specification or colorway is temporarily out of production. Our representative will contact you with alternative swatches."}', 80),
  ('quick_replies', 'insufficient_info', 'Incomplete Buyer Specs', 'amber', '{"scene":"rejection","content":"Please provide additional technical specifications (GSM, width, finishing) or business credentials to proceed with this commercial quotation."}', 90),

  ('customer_tiers', 'STANDARD', 'Standard Buyer', 'slate', '{"discount_label":"List Price","description":"Standard factory wholesale catalog access"}', 10),
  ('customer_tiers', 'VIP', 'VIP Commercial', 'purple', '{"discount_label":"Tier-1 Volume Rates","description":"Priority sample allocation and dedicated textile specialist"}', 20),
  ('customer_tiers', 'PARTNER', 'Strategic Partner', 'emerald', '{"discount_label":"Contract Enterprise Pricing","description":"Net-30 payment terms, annual allocation & white-glove logistics"}', 30),
  ('customer_tiers', 'DISTRIBUTOR', 'Regional Distributor', 'indigo', '{"discount_label":"Exclusive Agency Rates","description":"Authorized territory distributor pricing and bespoke sample kits"}', 40),

  ('customer_tags', 'haute_couture', 'Haute Couture', 'purple', '{}', 10),
  ('customer_tags', 'chain_retailer', 'Chain Retailer', 'blue', '{}', 20),
  ('customer_tags', 'sample_sent', 'Sample Sent', 'emerald', '{}', 30),
  ('customer_tags', 'net30_credit', 'Net-30 Credit', 'amber', '{}', 40),
  ('customer_tags', 'high_value', 'High Value Account', 'rose', '{}', 50),

  ('inquiry_types', 'quote_cart', 'Bulk RFQ', 'blue', '{"description":"Multi-item commercial quotation request"}', 10),
  ('inquiry_types', 'swatch_request', 'Swatch Sample', 'purple', '{"description":"Physical textile sample / swatch request"}', 20),
  ('inquiry_types', 'custom_oem', 'Custom OEM', 'amber', '{"description":"Bespoke textile development inquiry"}', 30),

  ('order_statuses', 'PENDING_APPROVAL', 'Pending Approval', 'amber', '{"sla_hours":24}', 10),
  ('order_statuses', 'APPROVED', 'Approved / Processing', 'blue', '{}', 20),
  ('order_statuses', 'SHIPPED', 'Dispatched / In Transit', 'emerald', '{}', 30),
  ('order_statuses', 'REJECTED', 'Rejected', 'rose', '{}', 40);
UPDATE OR IGNORE sys_dict_items SET item_key = 'PENDING_APPROVAL', item_label = 'Pending Approval' WHERE group_code = 'order_statuses' AND item_key = 'PENDING_REVIEW';
DELETE FROM sys_dict_items WHERE group_code = 'order_statuses' AND item_key = 'PENDING_REVIEW';
INSERT OR IGNORE INTO sys_dict_items (group_code, item_key, item_label, badge_color, meta_json, sort_order) VALUES

  ('audit_actions', 'CREATE_ORDER', 'Create Requisition', 'blue', '{"risk_level":"LOW"}', 10),
  ('audit_actions', 'APPROVE_ORDER', 'Approve Order', 'emerald', '{"risk_level":"LOW"}', 20),
  ('audit_actions', 'SHIP_ORDER', 'Dispatch Shipment', 'emerald', '{"risk_level":"LOW"}', 30),
  ('audit_actions', 'REJECT_ORDER', 'Reject Order', 'rose', '{"risk_level":"MEDIUM"}', 40),
  ('audit_actions', 'ASSIGN_ORDER', 'Assign Sales Rep', 'indigo', '{"risk_level":"LOW"}', 50),
  ('audit_actions', 'BATCH_ASSIGN_ORDERS', 'Batch Assign', 'indigo', '{"risk_level":"MEDIUM"}', 60),
  ('audit_actions', 'BATCH_APPROVE_ORDERS', 'Batch Approve', 'emerald', '{"risk_level":"MEDIUM"}', 70),
  ('audit_actions', 'BATCH_SHIP_ORDERS', 'Batch Ship', 'emerald', '{"risk_level":"MEDIUM"}', 80),
  ('audit_actions', 'BATCH_REJECT_ORDERS', 'Batch Reject', 'rose', '{"risk_level":"HIGH"}', 90),
  ('audit_actions', 'UPDATE_USER_TIER', 'Update Buyer Tier', 'purple', '{"risk_level":"MEDIUM"}', 100),
  ('audit_actions', 'BLOCK_USER', 'Block Account', 'rose', '{"risk_level":"HIGH"}', 110),
  ('audit_actions', 'UNBLOCK_USER', 'Unblock Account', 'slate', '{"risk_level":"MEDIUM"}', 120),
  ('audit_actions', 'UPSERT_ADMIN_MEMBER', 'Authorize Member', 'blue', '{"risk_level":"MEDIUM"}', 130),
  ('audit_actions', 'REMOVE_ADMIN_MEMBER', 'Remove Member', 'rose', '{"risk_level":"HIGH"}', 140),
  ('audit_actions', 'UPSERT_ADMIN_ROLE', 'Configure Role', 'purple', '{"risk_level":"HIGH"}', 150),
  ('audit_actions', 'DELETE_ADMIN_ROLE', 'Delete Role', 'rose', '{"risk_level":"HIGH"}', 160),
  ('audit_actions', 'UPSERT_DICT_ITEM', 'Update Dict Item', 'slate', '{"risk_level":"LOW"}', 170),
  ('audit_actions', 'DELETE_DICT_ITEM', 'Delete Dict Item', 'amber', '{"risk_level":"MEDIUM"}', 180),
  ('audit_actions', 'RESET_DICT_ITEMS', 'Reset Dict Group', 'rose', '{"risk_level":"HIGH"}', 190),
  ('audit_actions', 'UPDATE_SYSTEM_SETTINGS', 'Save Settings', 'slate', '{"risk_level":"MEDIUM"}', 200);
CREATE INDEX IF NOT EXISTS idx_orders_unclaimed_email ON orders(buyer_email, user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_assigned_to ON users(assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_lower_email ON orders(LOWER(buyer_email));
CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON user_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logins_created_at ON user_logins(created_at);
DROP INDEX IF EXISTS idx_error_logs_level;
DROP INDEX IF EXISTS idx_error_logs_source;
CREATE INDEX IF NOT EXISTS idx_error_logs_ray_id ON system_error_logs(ray_id);
DROP INDEX IF EXISTS idx_error_logs_created_at;
DROP INDEX IF EXISTS idx_error_logs_latency;
DROP INDEX IF EXISTS idx_error_logs_path;
DROP INDEX IF EXISTS idx_error_logs_ip;
DROP INDEX IF EXISTS idx_error_logs_country;
CREATE INDEX IF NOT EXISTS idx_error_logs_bottlenecks ON system_error_logs(created_at, path, method, latency_ms, error_code) WHERE latency_ms > 0 AND path IS NOT NULL AND path != '' AND (method IS NULL OR method != 'CLIENT') AND (error_code IS NULL OR error_code NOT IN ('WEB_VITALS', 'CLIENT_NAVIGATION'));
CREATE INDEX IF NOT EXISTS idx_error_logs_stats ON system_error_logs(created_at, level, error_code, latency_ms);
CREATE INDEX IF NOT EXISTS idx_admin_members_role ON admin_members(role_code);
CREATE INDEX IF NOT EXISTS idx_admin_members_status ON admin_members(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_dict_items_group ON sys_dict_items(group_code);
CREATE INDEX IF NOT EXISTS idx_dict_items_enabled ON sys_dict_items(is_enabled);
CREATE INDEX IF NOT EXISTS idx_dict_items_group_sort ON sys_dict_items(group_code, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_dict_items_sort ON sys_dict_items(sort_order, id);
CREATE INDEX IF NOT EXISTS idx_user_logins_user_created ON user_logins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_logins_email_created ON user_logins(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_status ON orders(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_email ON admin_audit_logs(admin_email)