"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type PaymentStatus = "pending" | "invoiced" | "paid" | "revoked" | "cancelled" | "expired";

export interface PaymentPlan {
  id: string;
  feature: "search";
  days: number;
  amount: number;
}

export interface Payment {
  id: string;
  plan: string;
  feature: "search";
  amount: number;
  days: number;
  phone: string;
  provider: string;
  status: PaymentStatus;
  externalId: string | null;
  createdAt: string;
  invoicedAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  accessUntil: string | null;
}

export interface AdminPayment extends Payment {
  adminNote: string | null;
  user: { id: string; displayName: string; phone: string; searchPaidUntil: string | null };
}

export const isOpenPayment = (p: Payment) => p.status === "pending" || p.status === "invoiced";

export function usePaymentPlans() {
  return useQuery({
    queryKey: ["payments", "plans"],
    queryFn: () => api.get<PaymentPlan[]>("/payments/plans"),
    staleTime: 10 * 60_000,
  });
}

/** The user's payments; polls while one awaits the admin or Kaspi. */
export function useMyPayments(enabled: boolean) {
  return useQuery({
    queryKey: ["payments", "mine"],
    queryFn: () => api.get<Payment[]>("/payments/mine"),
    enabled,
    refetchInterval: (query) => (query.state.data?.some(isOpenPayment) ? 10_000 : false),
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: string) => api.post<Payment>("/payments/checkout", { plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", "mine"] }),
  });
}

export function useCancelMyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Payment>(`/payments/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", "mine"] }),
  });
}

// ── Admin ──

export type AdminPaymentsFilter = "open" | "paid" | "all";

export function useAdminPayments(status: AdminPaymentsFilter, enabled = true) {
  return useQuery({
    queryKey: ["admin", "payments", status],
    queryFn: () => api.get<AdminPayment[]>(`/admin/payments?status=${status}`),
    enabled,
    refetchInterval: status === "open" ? 30_000 : false,
  });
}

/** Ends a user's paid search access now. */
export function useRevokeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<{ userId: string; revokedPayments: number }>(`/admin/subscriptions/${userId}/revoke`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useAdminPaymentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "invoiced" | "paid" | "cancel" }) =>
      api.post<AdminPayment>(`/admin/payments/${id}/${action}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
