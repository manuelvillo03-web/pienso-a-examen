/**
 * Etiquetas de ejemplo. Son inventadas, con la forma de las reales: no
 * describen ningún producto concreto.
 */
import type { Species, Stage } from './reference';

export interface Example {
  id: string;
  title: string;
  species: Species;
  stage: Stage;
  text: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'economico',
    title: 'Pienso económico',
    species: 'dog',
    stage: 'adult',
    text: `Composición: cereales, carnes y subproductos animales (4 % de pollo), subproductos de origen vegetal, aceites y grasas, sustancias minerales, azúcares.
Componentes analíticos: proteína bruta 20 %, grasa bruta 9 %, fibra bruta 3 %, ceniza bruta 8,5 %.
Aditivos: vitamina A, vitamina D3, vitamina E. Con colorantes y antioxidantes (aditivos CE).`,
  },
  {
    id: 'carne',
    title: 'Pienso con mucha carne',
    species: 'dog',
    stage: 'adult',
    text: `Composición: pollo fresco deshuesado (30 %), proteína de pollo deshidratada (25 %), boniato (16 %), guisantes, grasa de pollo (8 %), salmón deshidratado (5 %), pulpa de remolacha, aceite de salmón, levadura de cerveza, manzana, zanahoria, minerales.
Componentes analíticos: proteína bruta 34 %, grasa bruta 16 %, fibra bruta 3 %, ceniza bruta 8,5 %, humedad 8 %.
Aditivos nutricionales (por kg): vitamina A 20.000 UI, vitamina D3 1.500 UI, vitamina E 300 mg. Antioxidantes: extractos ricos en tocoferoles de origen natural.`,
  },
  {
    id: 'lata',
    title: 'Lata para gato',
    species: 'cat',
    stage: 'adult',
    text: `Composición: pollo (62 %), caldo de pollo (33 %), hígado de pollo (4 %), minerales (1 %).
Componentes analíticos: proteína bruta 11 %, grasa bruta 5,5 %, ceniza bruta 2 %, fibra bruta 0,3 %, humedad 80 %.
Aditivos nutricionales (por kg): taurina 1.500 mg, vitamina D3 200 UI, vitamina E 30 mg.`,
  },
];
