export type Service = {
  id: string;
  name: string;
  price: number;
  pricingModel: string;
};

export type Provider = {
  id: string;
  name: string;
  phone: string;
  serviceArea: string | null;
  verified: boolean;
  available: boolean;
  services: { id: string; name: string }[];
};

export type Requirement = {
  id: string;
  serviceId: string;
  serviceName: string;
  people: number;
  status: string;
  assignments: {
    id: string;
    providerId: string;
    providerName: string;
    status: string;
  }[];
};

export type Booking = {
  id: string;
  customerName: string;
  date: string;
  time: string;
  estimatedTotal: number;
  status: string;
  disputeReason?: string;
  resolutionNote?: string;
  refundAmount?: number;
  requirements: Requirement[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  active: boolean;
};

export type CatalogService = {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  pricingModel: string;
  active: boolean;
};

export type AdminCatalog = {
  categories: CatalogCategory[];
  services: CatalogService[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  joinedAt: string;
  bookingCount: number;
  lifetimeValue: number;
};
