/**
 * Nota de un alimento a partir de su etiqueta.
 *
 * Tres bloques que suman 100:
 *  - Nutrientes (40): proteína y grasa frente a los mínimos de FEDIAF, y los
 *    hidratos estimados.
 *  - Ingredientes (45): qué va primero, cuánto es de origen animal y si la
 *    etiqueta dice claramente qué lleva.
 *  - Aditivos (15).
 *
 * Los mínimos de proteína y grasa son de FEDIAF (ver reference.ts). Todo lo
 * demás son criterios propios, explicados en la página «Cómo puntuamos».
 * Cambiar un umbral obliga a subir METHOD_VERSION.
 */
import type { Ingredient, ParsedLabel } from './parse';
import { FEDIAF, type Species, type Stage } from './reference';

export const METHOD_VERSION = '2026.11';

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Reason {
  tone: Tone;
  text: string;
}
export interface Block {
  points: number;
  max: number;
  reasons: Reason[];
}

export interface DryMatter {
  /** Humedad usada en el cálculo y si se ha supuesto. */
  moisture: number;
  moistureAssumed: boolean;
  wet: boolean;
  protein: number;
  fat: number;
  fibre: number | null;
  ash: number | null;
  /** Hidratos estimados por diferencia. */
  carbs: number;
  carbsApprox: boolean;
}

export type Grade = 'Muy bueno' | 'Bueno' | 'Aceptable' | 'Flojo' | 'Deficiente';

export interface Result {
  score: number;
  grade: Grade;
  /** Falta algún apartado de la etiqueta y la nota se apoya solo en el resto. */
  partial: boolean;
  nutrients: Block | null;
  ingredients: Block | null;
  additives: Block;
  dry: DryMatter | null;
  notes: string[];
  methodVersion: string;
}

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  y0 + ((Math.min(Math.max(x, x0), x1) - x0) / (x1 - x0)) * (y1 - y0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const es = (v: number) => String(r1(v)).replace('.', ',');

/** Hidratos (% sobre materia seca) a partir de los que se empieza a restar y donde se queda en cero. */
const CARBS: Record<Species, { fine: number; worst: number }> = {
  dog: { fine: 30, worst: 55 },
  cat: { fine: 15, worst: 45 },
};

/** Nota máxima si la lista de ingredientes saca menos del 45 % de sus puntos. */
const CAP_UNCLEAR = 60;
/** Nota máxima si la proteína no llega al mínimo de FEDIAF. */
const CAP_LOW_PROTEIN = 49;

// ------------------------------------------------------------ materia seca

export function dryMatter(label: ParsedLabel): DryMatter | null {
  const a = label.analytical;
  if (a.protein === undefined || a.fat === undefined) return null;
  let moisture = a.moisture;
  let moistureAssumed = false;
  if (moisture === undefined) {
    // La norma europea obliga a declarar la humedad si pasa del 14 %. Si no
    // aparece, es un alimento seco… salvo que la proteína delate una lata.
    if (a.protein < 14) return null;
    moisture = 9;
    moistureAssumed = true;
  }
  if (moisture >= 95) return null;
  const k = 100 / (100 - moisture);
  const protein = a.protein * k;
  const fat = a.fat * k;
  const fibre = a.fibre === undefined ? null : a.fibre * k;
  const ash = a.ash === undefined ? null : a.ash * k;
  const carbs = Math.max(0, 100 - protein - fat - (fibre ?? 3) - (ash ?? 8));
  return {
    moisture, moistureAssumed, wet: moisture > 40, protein, fat, fibre, ash, carbs,
    carbsApprox: fibre === null || ash === null || moistureAssumed,
  };
}

// --------------------------------------------------------------- nutrientes

function scoreNutrients(d: DryMatter, species: Species, stage: Stage): Block {
  const ref = FEDIAF[species][stage];
  const reasons: Reason[] = [];
  const who = species === 'dog' ? (stage === 'adult' ? 'un perro adulto' : 'un cachorro') : stage === 'adult' ? 'un gato adulto' : 'un gatito';

  let protein: number;
  if (d.protein < ref.proteinMin) {
    protein = 0;
    reasons.push({ tone: 'bad', text: `Proteína: ${es(d.protein)} % sobre materia seca, por debajo del mínimo que FEDIAF recomienda para ${who} (${es(ref.proteinMin)} %).` });
  } else if (d.protein < ref.proteinComfort) {
    protein = lerp(d.protein, ref.proteinMin, ref.proteinComfort, 6, 12);
    reasons.push({ tone: 'warn', text: `Proteína: ${es(d.protein)} % sobre materia seca. Cumple el mínimo (${es(ref.proteinMin)} %) pero no llega al valor más exigente de FEDIAF (${es(ref.proteinComfort)} %).` });
  } else {
    protein = lerp(d.protein, ref.proteinComfort, ref.proteinTop, 12, 20);
    reasons.push({ tone: 'good', text: `Proteína: ${es(d.protein)} % sobre materia seca, por encima de lo que FEDIAF recomienda para ${who} (${es(ref.proteinComfort)} %).` });
  }

  let fat = 5;
  if (d.fat < ref.fatMin) {
    fat = 0;
    reasons.push({ tone: 'bad', text: `Grasa: ${es(d.fat)} % sobre materia seca, por debajo del mínimo recomendado (${es(ref.fatMin)} %).` });
  } else {
    reasons.push({ tone: 'good', text: `Grasa: ${es(d.fat)} % sobre materia seca, por encima del mínimo (${es(ref.fatMin)} %).` });
  }

  const c = CARBS[species];
  const carbs = lerp(d.carbs, c.fine, c.worst, 12, 0);
  // Si falta algún dato, el cálculo es aproximado y se da sin decimales.
  const shown = d.carbsApprox ? `unos ${Math.round(d.carbs)}` : es(d.carbs);
  const animal = species === 'dog' ? 'un perro' : 'un gato, que es carnívoro estricto';
  if (d.carbs <= c.fine) reasons.push({ tone: 'good', text: `Hidratos: ${shown} % sobre materia seca (estimados). Bajo para ${animal}.` });
  else if (carbs >= 5) reasons.push({ tone: 'warn', text: `Hidratos: ${shown} % sobre materia seca (estimados). Algo alto para ${animal}.` });
  else reasons.push({ tone: 'bad', text: `Hidratos: ${shown} % sobre materia seca (estimados). Mucho para ${animal}: buena parte de la receta es almidón.` });

  let ash = 1.5;
  if (d.ash !== null) {
    ash = lerp(d.ash, 9, 13, 3, 0);
    if (d.ash > 11) reasons.push({ tone: 'warn', text: `Ceniza: ${es(d.ash)} % sobre materia seca. Un valor alto suele indicar mucha harina de carne y hueso.` });
  }

  if (d.moistureAssumed) reasons.push({ tone: 'info', text: 'La etiqueta no da la humedad; hemos supuesto un 9 %, lo habitual en un pienso seco.' });
  return { points: r1(protein + fat + carbs + ash), max: 40, reasons };
}

// ------------------------------------------------------------- ingredientes

const isMeat = (i: Ingredient) => i.kind === 'animal';
const isFiller = (i: Ingredient) => i.kind === 'cereal' || i.kind === 'starch' || i.kind === 'plantProtein';
/** El agua y los caldos de las latas no cuentan como primer ingrediente. */
const solid = (list: Ingredient[]) => list.filter((i) => i.kind !== 'water');

function scoreIngredients(all: Ingredient[]): Block {
  const reasons: Reason[] = [];
  const list = solid(all);
  const first = list[0];

  let lead: number;
  if (isMeat(first) && first.named) {
    lead = 15;
    reasons.push({ tone: 'good', text: `El primer ingrediente es de origen animal y dice cuál: «${first.name}».` });
    if (first.fresh && list[1] && isFiller(list[1])) {
      lead = 12;
      reasons.push({ tone: 'info', text: `«${first.name}» es fresco: lleva su agua, y una vez seco puede pesar menos que el segundo ingrediente («${list[1].name}»).` });
    }
  } else if (isMeat(first) && !first.vague) {
    lead = 10;
    reasons.push({ tone: 'warn', text: `El primer ingrediente es de origen animal, pero genérico: «${first.name}» no dice de qué especie.` });
  } else if (isMeat(first)) {
    lead = 6;
    reasons.push({ tone: 'warn', text: `El primer ingrediente es «${first.name}»: una categoría legal que no dice qué animal ni qué partes.` });
  } else if (first.vague) {
    lead = 0;
    reasons.push({ tone: 'bad', text: `El primer ingrediente es «${first.name}»: no es de origen animal y ni siquiera dice cuál es.` });
  } else {
    lead = 2;
    reasons.push({ tone: 'bad', text: `El primer ingrediente no es de origen animal: «${first.name}».` });
  }

  const top = list.slice(0, 5);
  const meats = top.filter(isMeat).length;
  const share = [0, 5, 8, 10][Math.min(meats, 3)];
  if (meats >= 2) reasons.push({ tone: 'good', text: `${meats} de los 5 primeros ingredientes son de origen animal.` });
  else if (meats === 1 && list.length >= 4) reasons.push({ tone: 'warn', text: 'Solo 1 de los 5 primeros ingredientes es de origen animal.' });
  else if (meats === 0) reasons.push({ tone: 'bad', text: 'Ninguno de los 5 primeros ingredientes es de origen animal.' });

  const declared = list.filter((i) => isMeat(i) && i.pct !== null);
  const animalPct = declared.reduce((a, i) => a + (i.pct as number), 0);
  let pct = 1;
  if (!declared.length) {
    reasons.push({ tone: 'info', text: 'No declara qué porcentaje es de origen animal.' });
  } else if (animalPct >= 50) {
    pct = 5;
    reasons.push({ tone: 'good', text: `Declara un ${es(Math.min(animalPct, 100))} % de ingredientes de origen animal.` });
  } else if (animalPct >= 25) {
    pct = 3;
    reasons.push({ tone: 'info', text: `Declara un ${es(animalPct)} % de ingredientes de origen animal.` });
  } else {
    pct = 0;
    reasons.push({ tone: 'warn', text: `Los porcentajes de origen animal que concreta suman solo un ${es(animalPct)} %.` });
  }

  const vague = list.filter((i) => i.vague);
  const clarity = Math.max(0, 10 - vague.reduce((a, i) => a + (i.kind === 'animal' || i.kind === 'cereal' ? 3 : 2), 0));
  if (vague.length) {
    reasons.push({ tone: vague.length > 1 ? 'bad' : 'warn', text: `Usa categorías en vez de ingredientes concretos: ${vague.map((i) => `«${i.name}»`).join(', ')}. Así la receta puede cambiar de un lote a otro.` });
  } else {
    reasons.push({ tone: 'good', text: 'Nombra cada ingrediente, sin categorías genéricas.' });
  }

  let extras = 5;
  const sugar = list.find((i) => i.kind === 'sugar');
  if (sugar) {
    extras -= 4;
    reasons.push({ tone: 'bad', text: `Lleva «${sugar.name}». Ni perros ni gatos necesitan azúcar añadido.` });
  }
  const cereals = list.slice(0, 6).filter((i) => i.kind === 'cereal' && i.named);
  if (cereals.length >= 3) {
    extras -= 2;
    reasons.push({ tone: 'warn', text: `Reparte el cereal en varios ingredientes (${cereals.map((i) => i.name).join(', ')}): sumados pueden pesar más que la carne.` });
  }

  return { points: r1(lead + share + pct + clarity + Math.max(0, extras)), max: 45, reasons };
}

// ----------------------------------------------------------------- aditivos

function scoreAdditives(label: ParsedLabel): Block {
  const reasons: Reason[] = [];
  const f = new Set(label.additives);
  let points = 15;
  if (f.has('colorants')) {
    points -= 6;
    reasons.push({ tone: 'bad', text: 'Lleva colorantes. Al animal le da igual el color: están para el dueño.' });
  }
  if (f.has('syntheticAntioxidants')) {
    points -= 5;
    reasons.push({ tone: 'warn', text: 'Usa antioxidantes sintéticos (BHA, BHT o similares). Están autorizados, pero hay alternativas naturales.' });
  }
  if (f.has('propyleneGlycol')) {
    points -= 4;
    reasons.push({ tone: 'warn', text: 'Lleva propilenglicol, un humectante habitual en alimentos semihúmedos.' });
  }
  if (f.has('nitrite')) {
    points -= 3;
    reasons.push({ tone: 'warn', text: 'Lleva nitrito como conservante.' });
  }
  if (f.has('unspecifiedPreservatives')) {
    points -= 2;
    reasons.push({ tone: 'info', text: 'Menciona conservantes o antioxidantes sin decir cuáles.' });
  }
  if (f.has('naturalAntioxidants')) reasons.push({ tone: 'good', text: 'Se conserva con antioxidantes naturales (tocoferoles o extracto de romero).' });
  if (!reasons.length) {
    if (label.hasAdditivesSection) reasons.push({ tone: 'good', text: 'Sin colorantes ni conservantes sintéticos entre los aditivos declarados.' });
    else {
      points = 12;
      reasons.push({ tone: 'info', text: 'No has pegado el apartado de aditivos, así que este bloque queda en un valor neutro.' });
    }
  }
  return { points: Math.max(0, points), max: 15, reasons };
}

// -------------------------------------------------------------------- nota

const grade = (s: number): Grade => (s >= 80 ? 'Muy bueno' : s >= 65 ? 'Bueno' : s >= 50 ? 'Aceptable' : s >= 35 ? 'Flojo' : 'Deficiente');

/** Devuelve `null` si en el texto no hay nada que analizar. */
export function scoreLabel(label: ParsedLabel, species: Species, stage: Stage): Result | null {
  const notes: string[] = [];
  const dry = dryMatter(label);
  // Para contar como lista de ingredientes tiene que haber algo reconocible.
  const list = solid(label.ingredients);
  const hasIngredients = list.length >= 2 && list.some((i) => i.kind !== 'other');
  if (!dry && !hasIngredients) return null;

  const nutrients = dry ? scoreNutrients(dry, species, stage) : null;
  const ingredients = hasIngredients ? scoreIngredients(label.ingredients) : null;
  const additives = scoreAdditives(label);

  if (!nutrients) {
    const a = label.analytical;
    notes.push(
      a.protein !== undefined && a.moisture === undefined
        ? 'Parece comida húmeda y falta la humedad. Sin ella no se pueden comparar los nutrientes; añade la línea «Humedad: … %».'
        : 'No hemos encontrado los componentes analíticos (proteína y grasa). La nota se basa solo en los ingredientes.',
    );
  }
  if (!ingredients) notes.push('No hemos encontrado la lista de ingredientes. La nota se basa solo en los componentes analíticos.');
  if (label.multipleRecipes) notes.push('La etiqueta trae varias recetas; hemos analizado la primera.');

  const blocks = [nutrients, ingredients, additives].filter((b): b is Block => b !== null);
  const got = blocks.reduce((a, b) => a + b.points, 0);
  const max = blocks.reduce((a, b) => a + b.max, 0);
  let score = Math.round((got / max) * 100);

  // Dos topes, para que un bloque brillante no tape un fallo de fondo.
  if (ingredients && ingredients.points / ingredients.max < 0.45 && score > CAP_UNCLEAR) {
    score = CAP_UNCLEAR;
    notes.push('La nota no pasa de «Aceptable» porque la lista de ingredientes es pobre o poco clara, aunque los nutrientes salgan bien.');
  }
  if (dry && dry.protein < FEDIAF[species][stage].proteinMin && score > CAP_LOW_PROTEIN) {
    score = CAP_LOW_PROTEIN;
    notes.push('La nota no pasa de «Flojo» porque la proteína declarada no llega al mínimo recomendado.');
  }
  return {
    score, grade: grade(score), partial: !nutrients || !ingredients,
    nutrients, ingredients, additives, dry, notes, methodVersion: METHOD_VERSION,
  };
}
