import type { Property } from "./property";

export interface WishlistItem {
  id: string;
  userId: string;
  propertyId: string;
  property?: Property;
  notes?: string;
  createdAt: string;
}
