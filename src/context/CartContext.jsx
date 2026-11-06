import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { customerAPI } from "../services/api";

const CartContext = createContext();
const GUEST_CART_KEY = "maison_rue_cart:guest";
const LEGACY_CART_KEY = "cart";

function readGuestCart() {
  try {
    const stored = localStorage.getItem(GUEST_CART_KEY);
    if (stored) return JSON.parse(stored) || [];
    // The old key was shared by every account, so its ownership cannot be
    // established safely. Discard it instead of leaking it into another user.
    localStorage.removeItem(LEGACY_CART_KEY);
  } catch {
    // A disabled storage area behaves like an empty guest cart.
  }
  return [];
}

function writeGuestCart(cart) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    localStorage.removeItem(LEGACY_CART_KEY);
  } catch {
    // The in-memory cart remains usable when browser storage is unavailable.
  }
}

export function CartProvider({ children }) {
  const { currentUser, loading: authLoading } = useAuth();
  const [cart, setCart] = useState([]);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState("");
  const hydratedIdentity = useRef(null);
  const requestVersion = useRef(0);

  const identity = useMemo(() => {
    if (authLoading) return "loading";
    if (!currentUser) return "guest";
    if (currentUser.role === "customer") return `customer:${currentUser.id}`;
    return `portal:${currentUser.role}`;
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (identity === "loading") return;
    const version = ++requestVersion.current;
    hydratedIdentity.current = null;
    setCart([]);
    setSelectedCartItemIds(null);
    setCartError("");
    setCartLoading(true);

    async function hydrate() {
      try {
        if (identity === "guest") {
          if (version === requestVersion.current) setCart(readGuestCart());
        } else if (identity.startsWith("customer:")) {
          const guestCart = readGuestCart();
          const result = guestCart.length
            ? await customerAPI.saveCart(guestCart, "merge")
            : await customerAPI.getCart();
          if (version !== requestVersion.current) return;
          setCart(result.cart || []);
          if (guestCart.length) {
            localStorage.removeItem(GUEST_CART_KEY);
            localStorage.removeItem(LEGACY_CART_KEY);
          }
        }
      } catch (error) {
        if (version === requestVersion.current) {
          setCart([]);
          setCartError(error.message || "Unable to sync your shopping bag.");
        }
      } finally {
        if (version === requestVersion.current) {
          hydratedIdentity.current = identity;
          setCartLoading(false);
        }
      }
    }
    hydrate();
  }, [identity]);

  useEffect(() => {
    if (hydratedIdentity.current !== identity || cartLoading) return undefined;
    if (identity === "guest") {
      writeGuestCart(cart);
      return undefined;
    }
    if (!identity.startsWith("customer:")) return undefined;
    const timer = window.setTimeout(() => {
      customerAPI.saveCart(cart, "replace").catch((error) => {
        setCartError(error.message || "Unable to save changes to your shopping bag.");
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cart, cartLoading, identity]);

  useEffect(() => {
    if (identity !== "guest") return undefined;
    const syncGuestCart = (event) => {
      if (event.key === GUEST_CART_KEY && hydratedIdentity.current === "guest") {
        try { setCart(JSON.parse(event.newValue || "[]")); } catch { setCart([]); }
      }
    };
    window.addEventListener("storage", syncGuestCart);
    return () => window.removeEventListener("storage", syncGuestCart);
  }, [identity]);

  function addToCart(product, quantity = 1, selectedColor = null, selectedSize = null, variant = null) {
    if (identity === "loading" || identity.startsWith("portal:")) return false;
    const color = selectedColor || product.colors?.[0] || "";
    const variantId = variant?.id || null;
    setCartError("");
    setCart((previous) => {
      const existing = previous.find((item) => variantId
        ? item.variantId === variantId
        : item.id === product.id && item.selectedColor === color && item.selectedSize === selectedSize);
      const stock = variant?.stock ?? product.stock ?? 0;
      const cappedQuantity = Math.min(10, Math.max(1, Number(quantity) || 1));
      if (existing) {
        return previous.map((item) => item === existing
          ? { ...item, quantity: Math.min(10, item.quantity + cappedQuantity) }
          : item);
      }
      return [...previous, {
        ...product,
        quantity: cappedQuantity,
        selectedColor: color,
        selectedSize,
        variantId,
        sku: variant?.sku || null,
        variantStock: stock,
        price: variant?.price ?? product.price,
        cartItemId: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }];
    });
    return true;
  }

  function removeFromCart(cartItemId) {
    setCart((previous) => previous.filter((item) => item.cartItemId !== cartItemId));
    setSelectedCartItemIds((previous) => previous === null ? null : previous.filter((id) => id !== cartItemId));
  }

  function removeCartItems(cartItemIds) {
    const ids = new Set(cartItemIds);
    setCart((previous) => previous.filter((item) => !ids.has(item.cartItemId)));
    setSelectedCartItemIds((previous) => previous === null ? null : previous.filter((id) => !ids.has(id)));
  }

  function toggleCartItemSelected(cartItemId) {
    setSelectedCartItemIds((previous) => {
      const selected = previous === null ? cart.map((item) => item.cartItemId) : previous;
      return selected.includes(cartItemId) ? selected.filter((id) => id !== cartItemId) : [...selected, cartItemId];
    });
  }

  function setAllCartItemsSelected(selected) {
    setSelectedCartItemIds(selected ? null : []);
  }

  function updateQuantity(cartItemId, quantity) {
    setCart((previous) => previous.map((item) => item.cartItemId === cartItemId
      ? { ...item, quantity: Math.max(1, Math.min(10, Number(quantity) || 1)) }
      : item));
  }

  async function clearCart() {
    setCart([]);
    setSelectedCartItemIds(null);
    if (identity === "guest") writeGuestCart([]);
    if (identity.startsWith("customer:")) {
      try { await customerAPI.clearCart(); }
      catch (error) { setCartError(error.message || "Unable to clear your shopping bag on the server."); }
    }
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const selectedItems = selectedCartItemIds === null ? cart : cart.filter((item) => selectedCartItemIds.includes(item.cartItemId));
  const selectedCartCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const selectedCartTotal = selectedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, removeCartItems, updateQuantity, clearCart, cartCount, cartTotal, cartLoading, cartError, selectedCartItemIds, selectedItems, selectedCartCount, selectedCartTotal, toggleCartItemSelected, setAllCartItemsSelected }}>
      {children}
    </CartContext.Provider>
  );
}

export default CartContext;
