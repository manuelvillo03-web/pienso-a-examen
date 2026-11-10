/**
 * Mínimos recomendados de proteína y grasa, en g por 100 g de materia seca.
 *
 * Fuente: FEDIAF, «Nutritional Guidelines for Complete and Complementary Pet
 * Food for Cats and Dogs», publicación de julio de 2024, tablas III-3 (perros)
 * y III-4 (gatos). FEDIAF da dos valores para adultos según el gasto de
 * energía; aquí `proteinMin` es el del animal activo y `proteinComfort` el
 * del poco activo (el más exigente, y el caso de la mayoría de mascotas de
 * piso).
 *
 * `proteinTop` NO es de FEDIAF: es el punto a partir del cual esta web ya da
 * la puntuación máxima de proteína.
 */
export type Species = 'dog' | 'cat';
export type Stage = 'adult' | 'growth';

export interface Reference {
  proteinMin: number;
  proteinComfort: number;
  proteinTop: number;
  fatMin: number;
}

export const FEDIAF: Record<Species, Record<Stage, Reference>> = {
  dog: {
    // Adulto: 18,0 (110 kcal/kg^0,75) y 21,0 (95 kcal/kg^0,75). Grasa 5,5.
    adult: { proteinMin: 18, proteinComfort: 21, proteinTop: 30, fatMin: 5.5 },
    // Crecimiento: 20,0 (desde 14 semanas) y 25,0 (antes y reproducción). Grasa 8,5.
    growth: { proteinMin: 20, proteinComfort: 25, proteinTop: 32, fatMin: 8.5 },
  },
  cat: {
    // Adulto: 25,0 (100 kcal/kg^0,67) y 33,3 (75 kcal/kg^0,67). Grasa 9,0.
    adult: { proteinMin: 25, proteinComfort: 33.3, proteinTop: 42, fatMin: 9 },
    // Crecimiento 28,0 y reproducción 30,0. Grasa 9,0.
    growth: { proteinMin: 28, proteinComfort: 30, proteinTop: 42, fatMin: 9 },
  },
};
