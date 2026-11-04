import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { customerAPI } from "../services/api";
import { useAuth } from "./AuthContext";

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { currentUser } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const refreshFavorites = useCallback(async () => {
    if (currentUser?.role !== "customer") { setFavoriteIds(new Set()); return; }
    setLoading(true);
    try {
      const result = await customerAPI.getFavorites();
      setFavoriteIds(new Set(result.productIds || []));
    } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { refreshFavorites().catch(() => setFavoriteIds(new Set())); }, [refreshFavorites]);

  const toggleFavorite = useCallback(async (productId) => {
    if (currentUser?.role !== "customer") return { requiresLogin: true };
    const active = !favoriteIds.has(Number(productId));
    setFavoriteIds((current) => { const next = new Set(current); active ? next.add(Number(productId)) : next.delete(Number(productId)); return next; });
    try { await customerAPI.setFavorite(productId, active); return { success: true, active }; }
    catch (error) { await refreshFavorites(); throw error; }
  }, [currentUser, favoriteIds, refreshFavorites]);

  const value = useMemo(() => ({ favoriteIds, loading, isFavorite: (id) => favoriteIds.has(Number(id)), toggleFavorite, refreshFavorites }), [favoriteIds, loading, refreshFavorites, toggleFavorite]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
