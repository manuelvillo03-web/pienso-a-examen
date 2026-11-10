/**
 * Búsqueda por código de barras en Open Pet Food Facts, la base de datos
 * abierta de alimentos para mascotas (licencia ODbL). Solo viaja el código de
 * barras; nada sobre el usuario ni sobre su animal.
 */
const API = 'https://world.openpetfoodfacts.org/api/v2/product';

export interface FoundProduct {
  name: string;
  brand: string;
  /** Texto de la etiqueta tal como lo guardó quien dio de alta el producto. */
  text: string;
}

export type Lookup =
  | { status: 'found'; product: FoundProduct }
  | { status: 'empty'; product: FoundProduct } // está, pero sin ingredientes
  | { status: 'missing' }
  | { status: 'error' };

export const isBarcode = (s: string) => /^\d{8,14}$/.test(s.trim());

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Lookup> {
  try {
    const fields = 'product_name,brands,ingredients_text_es,ingredients_text';
    const res = await fetch(`${API}/${encodeURIComponent(code.trim())}.json?fields=${fields}`, { signal });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error' };
    const data = (await res.json()) as { status?: number; product?: Record<string, string | undefined> };
    if (data.status !== 1 || !data.product) return { status: 'missing' };
    const p = data.product;
    const product = {
      name: (p.product_name ?? '').trim(),
      brand: (p.brands ?? '').split(',')[0].trim(),
      text: (p.ingredients_text_es || p.ingredients_text || '').trim(),
    };
    return { status: product.text ? 'found' : 'empty', product };
  } catch {
    return { status: 'error' };
  }
}
