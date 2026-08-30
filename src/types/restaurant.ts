export type OrderStatus = 
  | 'pending'
  | 'pending_acceptance'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'partner_assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export type FulfillmentType = 'delivery' | 'takeaway' | 'dine_in' | 'pickup';

export interface OrderItem {
  id?: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
  size?: string;
  crust?: string;
  addons?: { name: string; price: number }[];
  image?: string;
}

export interface OrderCustomer {
  uid?: string;
  userId?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  deliveryAddress?: {
    addressLine?: string;
    landmark?: string;
    city?: string;
    pincode?: string;
    lat?: number;
    lng?: number;
  } | string;
}

export interface Order {
  id: string;
  orderNumber?: string;
  dailyOrderNumber?: number;
  userId?: string;
  customerId?: string;
  customerName?: string;
  contactPhone?: string;
  customerEmail?: string;
  deliveryAddress?: any;
  items: OrderItem[];
  subtotal?: number;
  totalAmount: number;
  deliveryFee?: number;
  taxes?: number;
  packagingCharge?: number;
  discountAmount?: number;
  status: OrderStatus;
  fulfillmentType?: FulfillmentType;
  deliveryType?: string;
  tableNumber?: string;
  orderSource?: any;
  paymentStatus?: any;
  paymentMethod?: any;
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  deliveryPartnerPhone?: string;
  deliveryPartnerLocation?: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
    lastUpdated?: string;
  };
  cancellationReason?: string;
  rejectionReason?: string;
  estimatedPreparationMinutes?: number;
  branchId?: string;
  branchName?: string;
  createdAt: any;
  updatedAt: any;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  phone: string;
  email?: string;
  isOnline: boolean;
  status: 'available' | 'busy' | 'offline';
  vehicleType?: string;
  vehicleNumber?: string;
  currentOrderId?: string;
  currentOrderNumber?: string;
  currentLocation?: {
    lat: number;
    lng: number;
    speed?: number;
    heading?: number;
    lastUpdated?: string;
  };
  lastSeen?: string;
  branchId?: string;
}

export interface ManagerDashboardStats {
  todayOrdersCount: number;
  todayCompletedCount: number;
  todayCancelledCount: number;
  todayRevenue: number;
  pendingCount: number;
  preparingCount: number;
  readyCount: number;
  outForDeliveryCount: number;
  onlineRidersCount: number;
  availableRidersCount: number;
  activeDeliveriesCount: number;
  deliveryOrdersCount: number;
  takeawayOrdersCount: number;
  dineInOrdersCount: number;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  targetAudience: 'customers' | 'staff' | 'delivery' | 'all';
  imageUrl?: string;
  deepLink?: string;
  sentAt: string;
  sentBy: string;
  sentByEmail?: string;
  branchId?: string;
  status: 'sent' | 'failed';
  recipientCount?: number;
  error?: string;
}

export interface EmailRecord {
  id: string;
  subject: string;
  recipients: string;
  template?: string;
  sentAt: string;
  sentBy: string;
  sentByEmail?: string;
  status: 'sent' | 'failed' | 'queued';
  recipientCount?: number;
  error?: string;
}

export interface ManagerAccount {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'restaurant_manager' | 'manager' | 'owner' | 'admin';
  branchId: string;
  branchName?: string;
  permissions: string[];
  isActive: boolean;
  createdAt?: string;
  lastLogin?: string;
}
