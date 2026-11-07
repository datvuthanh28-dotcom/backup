import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { customerAPI } from "../services/api";
import { useAuth } from "./AuthContext";

const FavoritesContext = createContext(null);
const GUEST_FAVORITES_KEY = "maison-rue-guest-favorites";

function readGuestFavorites() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function saveGuestFavorites(ids) {
  window.localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([...ids]));
}

export function FavoritesProvider({ children }) {
  const { currentUser } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(readGuestFavorites()));
  const [loading, setLoading] = useState(false);

  const refreshFavorites = useCallback(async () => {
    if (!currentUser) {
      setFavoriteIds(new Set(readGuestFavorites()));
      return;
    }
    if (currentUser.role !== "customer") { setFavoriteIds(new Set()); return; }
    setLoading(true);
    try {
      const result = await customerAPI.getFavorites();
      const accountIds = new Set(result.productIds || []);
      const guestIds = readGuestFavorites();
      const missingGuestIds = guestIds.filter((id) => !accountIds.has(id));
      const syncResults = await Promise.allSettled(missingGuestIds.map((id) => customerAPI.setFavorite(id, true)));
      syncResults.forEach((result, index) => {
        if (result.status === "fulfilled") accountIds.add(missingGuestIds[index]);
      });
      if (syncResults.every((result) => result.status === "fulfilled")) window.localStorage.removeItem(GUEST_FAVORITES_KEY);
      setFavoriteIds(accountIds);
    } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { refreshFavorites().catch(() => setFavoriteIds(new Set())); }, [refreshFavorites]);

  const toggleFavorite = useCallback(async (productId) => {
    if (!currentUser) {
      const id = Number(productId);
      const active = !favoriteIds.has(id);
      setFavoriteIds((current) => {
        const next = new Set(current);
        active ? next.add(id) : next.delete(id);
        saveGuestFavorites(next);
        return next;
      });
      return { success: true, active, guest: true };
    }
    if (currentUser.role !== "customer") return { requiresLogin: true };
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
