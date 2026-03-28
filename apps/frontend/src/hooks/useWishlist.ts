"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useWishlist() {
  return useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.get<{ items: any[] }>("/wishlist"),
    select: (data) => data.items,
  });
}

export function useIsWishlisted(propertyId: string) {
  return useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.get<{ items: any[] }>("/wishlist"),
    select: (data) =>
      data.items.some((item: any) => item.propertyId === propertyId),
    enabled: !!propertyId,
  });
}

export function useToggleWishlist() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["property"] });
  };

  const addMutation = useMutation({
    mutationFn: (propertyId: string) =>
      api.post("/wishlist", { propertyId }),
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: (propertyId: string) =>
      api.delete(`/wishlist/${propertyId}`),
    onSuccess: invalidateAll,
  });

  return { add: addMutation, remove: removeMutation };
}
