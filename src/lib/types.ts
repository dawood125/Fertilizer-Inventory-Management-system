export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  description: string | null;
  logo_url?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  category_id: string | null;
  brand_id: string | null;
  purchase_price: number;
  retail_price: number;
  wholesale_price: number;
  dealer_price: number;
  special_price: number;
  stock_quantity: number;
  min_stock_level: number;
  unit: string;
  status: string;
  company_id: string | null;
  cost_price: number;
  promotional_price: number;
  min_selling_price: number;
  description: string | null;
  carton_to_box: number;
  box_to_pack: number;
  pack_to_piece: number;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
  loyalty_points: number;
  type: string;
  owner_name: string | null;
  cnic: string | null;
  ntn: string | null;
  area: string | null;
  route_id: string | null;
  sales_rep_id: string | null;
  credit_limit: number;
  opening_balance: number;
  default_price_type: string;
  allow_manual_override: boolean;
  custom_price: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
  company_id: string | null;
  opening_balance: number;
  contact_person: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  status: string;
  payment_status: string;
  note: string | null;
  sales_rep_id: string | null;
  route_id: string | null;
  delivery_date: string | null;
  invoice_number: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  total: number;
  free_items?: number;
  unit?: string;
  cost_price?: number;
  total_cost?: number;
  batch_number?: string;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  method: string;
  account_type: string | null;
  amount: number;
  note?: string | null;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  purchase_id?: string | null;
  payment_number?: string | null;
  method: string;
  account_type: string | null;
  amount: number;
  note?: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  subtotal: number;
  tax: number;
  total: number;
  paid_amount: number;
  status: string;
  payment_status: string;
  note: string | null;
  expected_delivery_date: string | null;
  received_date: string | null;
  discount: number;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total: number;
  retail_price?: number;
  wholesale_price?: number;
  dealer_price?: number;
  batch_number?: string;
  cartons?: number;
  pieces_per_carton?: number;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: string;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  category_id: string | null;
  amount: number;
  date: string;
  payment_method: string;
  note: string | null;
  receipt_note: string | null;
  status: string;
  created_at: string;
}

export interface PaymentAccount {
  id: string;
  type: string;
  name: string;
  balance: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: string;
  account_type: string | null;
  from_account: string | null;
  to_account: string | null;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  party_type: string | null;
  party_id: string | null;
  note: string | null;
  date: string;
  created_at: string;
}

export interface Settings {
  id: string;
  store_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  ntn: string | null;
  currency: string;
  currency_symbol: string;
  timezone: string;
  receipt_footer: string | null;
  invoice_prefix: string;
  receipt_size: string;
  terms_conditions: string | null;
  barcode_on_invoice: boolean;
  tax_inclusive: boolean;
  created_at: string;
}

export interface CustomerProductPrice {
  id: string;
  customer_id: string;
  product_id: string;
  unit_price: number;
  created_at: string;
  updated_at?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  phone: string | null;
  active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface TaxRate {
  id: string;
  name: string;
  percentage: number;
  inclusive: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  description: string | null;
  created_at: string;
}

export interface Route {
  id: string;
  name: string;
  area: string | null;
  driver_name: string | null;
  vehicle: string | null;
  description: string | null;
  created_at: string;
}

export interface SalesRep {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  route_id: string | null;
  commission_rate: number;
  target_monthly: number;
  status: string;
  created_at: string;
  routes?: { name: string } | null;
}

export interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  quantity: number;
  damaged_quantity: number;
  batch_cost: number;
  status: string;
  purchase_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Delivery {
  id: string;
  challan_number: string;
  order_id: string | null;
  route_id: string | null;
  vehicle: string | null;
  driver_name: string | null;
  dispatch_date: string;
  delivered_date: string | null;
  status: string;
  note: string | null;
  created_at: string;
}

export interface DeliveryItem {
  id: string;
  delivery_id: string;
  product_id: string | null;
  product_name: string | null;
  ordered_quantity: number;
  delivered_quantity: number;
  pending_quantity: number;
  batch_number: string | null;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  order_id: string | null;
  customer_id: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  reason: string;
  resolution: string;
  status: string;
  note: string | null;
  created_at: string;
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  purchase_id: string | null;
  supplier_id: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_cost: number;
  total_amount: number;
  reason: string;
  resolution?: string;
  refund_account?: string;
  status: string;
  note: string | null;
  created_at: string;
}

export interface Claim {
  id: string;
  claim_number: string;
  type: string;
  party_type: string | null;
  party_id: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  amount: number;
  reason: string | null;
  status: string;
  resolution: string | null;
  note: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  created_at: string;
}
