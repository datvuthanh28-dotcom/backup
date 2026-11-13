import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { customerAPI } from "../services/api";
import { useAuth } from "./AuthContext";

const FavoritesContext = createContext(null);
const GUEST_FAVORITES_KEY = "maison-rue-guest-favorites";

function readGuestFavorites() {
  try {
    const raw = window.localStorage.getItem(GUEST_FAVORITES_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];
    const valid = saved
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    return [...new Set(valid)];
  } catch {
    return [];
  }
}

function saveGuestFavorites(ids) {
  try {
    const arr = [...ids].map(Number).filter((n) => Number.isInteger(n) && n > 0);
    window.localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([...new Set(arr)]));
  } catch {
    // Storage may be unavailable in restricted contexts
  }
}

function clearGuestFavorites() {
  try {
    window.localStorage.removeItem(GUEST_FAVORITES_KEY);
  } catch {
    // ignore
  }
}

export function FavoritesProvider({ children }) {
  const { currentUser, loading: authLoading } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(readGuestFavorites()));
  const [loading, setLoading] = useState(false);

  const identity = useMemo(() => {
    if (authLoading) return "loading";
    if (!currentUser) return "guest";
    if (currentUser.role === "customer") return `customer:${currentUser.id}`;
    return `portal:${currentUser.role}`;
  }, [authLoading, currentUser]);

  const previousIdentityRef = useRef("guest");
  const isSyncingRef = useRef(false);
  const requestVersionRef = useRef(0);

  const refreshFavorites = useCallback(async () => {
    if (identity === "loading") return;
    const version = ++requestVersionRef.current;

    if (identity.startsWith("portal:")) {
      setFavoriteIds(new Set());
      setLoading(false);
      return;
    }

    if (identity === "guest") {
      setFavoriteIds(new Set(readGuestFavorites()));
      setLoading(false);
      return;
    }

    if (identity.startsWith("customer:")) {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      setLoading(true);
      try {
        const guestIds = readGuestFavorites();
        if (guestIds.length > 0) {
          const result = await customerAPI.syncFavorites(guestIds);
          if (version !== requestVersionRef.current) return;
          if (result && result.success) {
            setFavoriteIds(new Set((result.productIds || []).map(Number)));
            clearGuestFavorites();
          }
        } else {
          const result = await customerAPI.getFavorites();
          if (version !== requestVersionRef.current) return;
          if (result && result.success) {
            setFavoriteIds(new Set((result.productIds || []).map(Number)));
          }
        }
      } catch (err) {
        console.error("[FavoritesContext] Sync/fetch error:", err);
      } finally {
        isSyncingRef.current = false;
        if (version === requestVersionRef.current) {
          setLoading(false);
        }
      }
    }
  }, [identity]);

  useEffect(() => {
    if (identity === "loading") return;

    const prevIdentity = previousIdentityRef.current;
    previousIdentityRef.current = identity;
    const version = ++requestVersionRef.current;

    // Portal roles (staff / admin)
    if (identity.startsWith("portal:")) {
      setFavoriteIds(new Set());
      setLoading(false);
      return;
    }

    // Customer logout: previous identity was customer, current is guest
    if (prevIdentity.startsWith("customer:") && identity === "guest") {
      // Isolate customer favorites: do NOT leak customer favorites to guest localStorage.
      // Guest storage is already empty from previous sync.
      setFavoriteIds(new Set(readGuestFavorites()));
      setLoading(false);
      return;
    }

    // Guest identity: keep or update from guest storage
    if (identity === "guest") {
      setFavoriteIds(new Set(readGuestFavorites()));
      setLoading(false);
      return;
    }

    // Customer identity (login, register, or reload session)
    if (identity.startsWith("customer:")) {
      async function syncCustomerFavorites() {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        setLoading(true);
        try {
          const guestIds = readGuestFavorites();
          if (guestIds.length > 0) {
            // MERGE guest favorites with customer's database favorites
            const result = await customerAPI.syncFavorites(guestIds);
            if (version !== requestVersionRef.current) return;
            if (result && result.success) {
              setFavoriteIds(new Set((result.productIds || []).map(Number)));
              // Only clear guest localStorage once backend confirms success
              clearGuestFavorites();
            }
          } else {
            // Regular fetch from database
            const result = await customerAPI.getFavorites();
            if (version !== requestVersionRef.current) return;
            if (result && result.success) {
              setFavoriteIds(new Set((result.productIds || []).map(Number)));
            }
          }
        } catch (err) {
          console.error("[FavoritesContext] Sync error:", err);
          // On network/server failure: do NOT clear localStorage or wipe in-memory favorites
        } finally {
          isSyncingRef.current = false;
          if (version === requestVersionRef.current) {
            setLoading(false);
          }
        }
      }

      syncCustomerFavorites();
    }
  }, [identity]);

  // Sync across tabs for guest
  useEffect(() => {
    if (identity !== "guest") return undefined;
    const handleStorageChange = (e) => {
      if (e.key === GUEST_FAVORITES_KEY) {
        setFavoriteIds(new Set(readGuestFavorites()));
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [identity]);

  const toggleFavorite = useCallback(async (productId) => {
    const id = Number(productId);
    if (!id || !Number.isInteger(id) || id <= 0) return { success: false };

    // Guest or loading state
    if (identity === "loading" || identity === "guest") {
      const active = !favoriteIds.has(id);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (active) {
          next.add(id);
        } else {
          next.delete(id);
        }
        saveGuestFavorites(next);
        return next;
      });
      return { success: true, active, guest: true };
    }

    // Portal roles (admin / staff)
    if (identity.startsWith("portal:")) {
      return { requiresLogin: true, roleBlocked: true };
    }

    // Authenticated Customer
    if (identity.startsWith("customer:")) {
      const active = !favoriteIds.has(id);
      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (active) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });

      try {
        await customerAPI.setFavorite(id, active);
        return { success: true, active };
      } catch (error) {
        // Rollback optimistic update on failure
        setFavoriteIds((prev) => {
          const rollback = new Set(prev);
          if (active) {
            rollback.delete(id);
          } else {
            rollback.add(id);
          }
          return rollback;
        });
        throw error;
      }
    }

    return { success: false };
  }, [identity, favoriteIds]);

  const value = useMemo(() => ({
    favoriteIds,
    favoriteCount: favoriteIds.size,
    loading,
    isFavorite: (id) => favoriteIds.has(Number(id)),
    toggleFavorite,
    refreshFavorites,
  }), [favoriteIds, loading, refreshFavorites, toggleFavorite]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
