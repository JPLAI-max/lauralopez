import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, type CurrentUser } from "@/lib/admin-api";

export function useAdminAuth() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => authApi.me().then((r) => r.user),
    retry: false,
    staleTime: 30_000,
  });

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.clear();
    },
  });

  return {
    user: data as CurrentUser | undefined,
    isLoading,
    isAuthenticated: !!data,
    logout,
  };
}
