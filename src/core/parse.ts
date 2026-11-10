/**
 * Lectura de la etiqueta de un alimento para perros o gatos.
 *
 * La etiqueta europea tiene tres partes: la composición (ingredientes, de más
 * a menos peso), los componentes analíticos (proteína, grasa, fibra, ceniza y
 * humedad) y los aditivos. Aquí se separan y se convierten en datos.
 */

export type Kind =
  | 'animal' // carne, pescado, huevo, vísceras
  | 'fat' // grasas y aceites
  | 'cereal'
  | 'starch' // patata, legumbres, tapioca
  | 'plantProtein' // concentrados de proteína vegetal
  | 'fibre'
  | 'veg' // frutas, verduras, hierbas
  | 'sugar'
  | 'mineral'
  | 'water' // agua y caldos
  | 'other';

export interface Ingredient {
  /** Tal como viene en la etiqueta, sin el porcentaje. */
  name: string;
  /** Texto completo del ingrediente, con paréntesis. */
  raw: string;
  /** Porcentaje declarado, si lo hay. */
  pct: number | null;
  kind: Kind;
  /** Nombra la especie o el alimento («pollo», «arroz») en vez de una categoría. */
  named: boolean;
  /** Declaración por categorías («carnes y subproductos animales», «cereales»). */
  vague: boolean;
  /** Carne o pescado fresco: lleva su agua y pesa menos una vez seco. */
  fresh: boolean;
}

export interface Analytical {
  protein?: number;
  fat?: number;
  fibre?: number;
  ash?: number;
  moisture?: number;
}

export type AdditiveFlag =
  | 'colorants'
  | 'syntheticAntioxidants'
  | 'propyleneGlycol'
  | 'nitrite'
  | 'unspecifiedPreservatives'
  | 'naturalAntioxidants';

export interface ParsedLabel {
  ingredients: Ingredient[];
  analytical: Analytical;
  additives: AdditiveFlag[];
  /** Se ha pegado un apartado de aditivos (aunque no tenga nada reseñable). */
  hasAdditivesSection: boolean;
  /** La etiqueta trae varias recetas y solo se ha leído la primera. */
  multipleRecipes: boolean;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const num = (s: string) => parseFloat(s.replace(',', '.'));

// ------------------------------------------------------------- apartados

type Section = 'composition' | 'analytical' | 'additives';

const HEADERS: [Section, RegExp][] = [
  ['analytical', /(componentes|constituyentes|valores|composicion) analitic[oa]s?|analisis (medio|garantizado|nutricional)/g],
  ['additives', /aditivos(?: nutricionales| tecnologicos| sensoriales| organolepticos| zootecnicos)?(?: ?\(?(?:por|\/) ?kg\)?)?/g],
  ['composition', /composicion|ingredientes/g],
];

function splitSections(text: string): Record<Section, string> & { headless: string } {
  const f = fold(text);
  const marks: { at: number; end: number; section: Section }[] = [];
  for (const [section, re] of HEADERS) {
    for (const m of f.matchAll(re)) {
      const at = m.index;
      // «composición analítica» ya se ha contado como componentes analíticos.
      if (marks.some((k) => at >= k.at && at < k.end)) continue;
      let end = at + m[0].length;
      while (end < f.length && /[\s:._*-]/.test(f[end])) end++;
      marks.push({ at, end, section });
    }
  }
  marks.sort((a, b) => a.at - b.at);
  const out = { composition: '', analytical: '', additives: '', headless: '' };
  out.headless = text.slice(0, marks.length ? marks[0].at : text.length);
  marks.forEach((k, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].at : text.length;
    out[k.section] += (out[k.section] ? '\n' : '') + text.slice(k.end, stop);
  });
  return out;
}

// --------------------------------------------------- componentes analíticos

const NUTRIENTS: [keyof Analytical, string, string][] = [
  // [clave, nombre con «bruta», nombre suelto]
  ['protein', 'proteinas? brutas?', 'proteinas?'],
  ['fat', 'grasas? brutas?|aceites y grasas brut[oa]s|materias? grasas? brutas?', 'grasas?|aceites y grasas|materias? grasas?|contenido (?:de|en) grasas?'],
  ['fibre', 'fibras? brutas?|celulosa bruta', 'fibras?(?: alimentarias?)?|celulosa'],
  ['ash', 'cenizas? brutas?|materia inorganica|residuo calcinado', 'cenizas?|materias? minerales?'],
  ['moisture', 'humedad|contenido de agua', 'humedad|agua'],
];

function readAnalytical(section: string, whole: string): Analytical {
  const out: Analytical = {};
  // Con apartado propio se aceptan los nombres sueltos («Proteína: 26 %»);
  // sin él, solo los inequívocos, para no confundir «proteína de pollo (25 %)».
  const strict = !section.trim();
  const f = fold(strict ? whole : section);
  for (const [key, full, loose] of NUTRIENTS) {
    const names = strict ? full : `${full}|${loose}`;
    const re = new RegExp(`(?:^|[^a-z])(?:${names})[^\\d%]{0,24}?(\\d+(?:[.,]\\d+)?)\\s*%`);
    const m = f.match(re);
    if (m) {
      const v = num(m[1]);
      if (v >= 0 && v <= 100) out[key] = v;
    }
  }
  return out;
}

// ------------------------------------------------------------ ingredientes

/** Parte por comas o puntos y coma que no estén dentro de un paréntesis ni sean decimales. */
function splitList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    const decimal = c === ',' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '');
    if ((c === ',' || c === ';') && depth === 0 && !decimal) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const ANIMALS =
  'pollo|pavo|pato|oca|codorniz|cordero|ternera|vacuno|buey|vaca|cerdo|porcino|jabali|conejo|venado|ciervo|caballo|cabra|canguro|' +
  'salmon|atun|trucha|arenque|sardina|caballa|bacalao|merluza|anchoa|boqueron|pescado blanco|gamba|langostino|mejillon|krill|' +
  'higado|corazon|huevos?|insectos?';
const GENERIC_ANIMALS = 'aves?(?: de corral)?|pescados?|carnes?|visceras|mariscos?';
const CEREALS = 'arroz|maiz|trigo|cebada|avena|sorgo|mijo|centeno|espelta|quinoa|gluten|cereales?';
const STARCHES = 'patatas?|boniatos?|batatas?|guisantes?|lentejas?|garbanzos?|habas?|soja|tapioca|mandioca|almidon|fecula|legumbres?';
const FIBRES = 'pulpa de remolacha|remolacha|celulosa|lignocelulosa|fibras? vegetal(?:es)?|salvado|psyllium|achicoria|inulina|fructooligosacaridos|mananooligosacaridos|fos|mos|cascarilla';
const SUGARS = 'azucar(?:es)?(?: varios)?|jarabe|glucosa|fructosa|dextrosa|sacarosa|melaza|caramelo|miel';
const MINERALS = 'minerales|sustancias minerales|cloruro|carbonato|fosfato|sulfato|sal|vitaminas?|taurina|oligoelementos';
const VEGS = 'manzana|zanahoria|calabaza|arandanos?|espinacas?|tomate|alfalfa|algas?|hierbas|frutas?|verduras?|hortalizas?|brocoli|calabacin|pera|platano|romero|yuca|linaza|lino|semillas?';

const has = (f: string, words: string) => new RegExp(`(?:^|[^a-z])(?:${words})(?:$|[^a-z])`).test(f);

function classify(name: string): Pick<Ingredient, 'kind' | 'named' | 'vague' | 'fresh'> {
  const f = fold(name);
  const fresh = /fresc[oa]s?|deshuesad[oa]s?/.test(f) && !/deshidratad|desecad|harina/.test(f);
  const base = { fresh: false, named: false, vague: false };

  if (/^(agua|caldo)|(?:^|[^a-z])caldo de/.test(f)) return { ...base, kind: 'water', named: true };

  // Declaraciones por categorías: legales, pero no dicen qué animal ni qué parte.
  if (/carnes? y subproductos|subproductos? (de origen )?animal|subproductos? carnicos|pescados? y subproductos|moluscos y crustaceos|huevos y (productos|derivados)|leche y productos|harinas? de carne|proteinas? (de origen )?animal|hidrolizado de proteinas? animal/.test(f)) {
    return { ...base, kind: 'animal', vague: true };
  }
  if (/aceites y grasas|grasas? (de origen )?animal|aceites? (de origen )?vegetal(es)?$|grasas? vegetal/.test(f)) {
    return { ...base, kind: 'fat', vague: true };
  }
  if (/subproductos? (de origen )?vegetal|extractos? de proteinas? vegetal|proteinas? vegetal(es)?$/.test(f)) {
    return { ...base, kind: /proteina/.test(f) ? 'plantProtein' : 'fibre', vague: true };
  }
  if (/^cereales?$|^(hortalizas|verduras|legumbres)$/.test(f.trim())) {
    return { ...base, kind: /cereal/.test(f) ? 'cereal' : 'veg', vague: true };
  }

  if (/grasa|aceite|manteca|sebo/.test(f)) return { ...base, kind: 'fat', named: true };
  if (has(f, FIBRES)) return { ...base, kind: 'fibre', named: true };
  if (has(f, SUGARS)) return { ...base, kind: 'sugar', named: true };
  if (/proteina de (guisante|patata|soja|arroz|maiz|trigo)|gluten/.test(f)) {
    return { ...base, kind: /gluten|arroz|maiz|trigo/.test(f) ? 'cereal' : 'plantProtein', named: true };
  }
  if (has(f, ANIMALS)) return { fresh, kind: 'animal', named: true, vague: false };
  if (has(f, GENERIC_ANIMALS)) return { fresh, kind: 'animal', named: false, vague: false };
  if (has(f, CEREALS)) return { ...base, kind: 'cereal', named: true };
  if (has(f, STARCHES)) return { ...base, kind: 'starch', named: true };
  if (has(f, MINERALS)) return { ...base, kind: 'mineral', named: true };
  if (has(f, VEGS)) return { ...base, kind: 'veg', named: true };
  return { ...base, kind: 'other', named: true };
}

function toIngredient(raw: string): Ingredient {
  const clean = raw.replace(/[.\s]+$/, '').trim();
  const name = clean
    .replace(/\(.*$/s, '')
    .replace(/\d+(?:[.,]\d+)?\s*%/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:-]+|[\s:-]+$/g, '');
  const m = clean.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return { name: name || clean, raw: clean, pct: m ? num(m[1]) : null, ...classify(name || clean) };
}

function readIngredients(section: string): { list: Ingredient[]; multiple: boolean } {
  const lines = section.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Varias recetas en un mismo envase («Con buey: … / Con pavo: …»): se lee la primera.
  const recipes = lines.filter((l) => l.includes(',') && /^[^,(]{2,60}:/.test(l));
  const multiple = recipes.length > 1;
  let text = multiple ? recipes[0] : lines.length ? lines.join(' ') : section;
  const colon = text.indexOf(':');
  if (colon > 0 && !text.slice(0, colon).includes(',')) text = text.slice(colon + 1);
  const list = splitList(text.replace(/\s+/g, ' '))
    .map(toIngredient)
    .filter((i) => /[a-záéíóúñ]{3}/i.test(i.name));
  return { list, multiple };
}

// ----------------------------------------------------------------- aditivos

function readAdditives(text: string): AdditiveFlag[] {
  const f = fold(text);
  /** Aparece la palabra y no va precedida de «sin» o «no contiene». */
  const mentions = (re: RegExp) => {
    for (const m of f.matchAll(new RegExp(re.source, 'g'))) {
      const before = f.slice(Math.max(0, m.index - 28), m.index);
      if (!/(?:^|[^a-z])(sin|no contiene|libre de|ni)[^.;]*$/.test(before)) return true;
    }
    return false;
  };
  const out: AdditiveFlag[] = [];
  if (mentions(/colorantes?/)) out.push('colorants');
  if (mentions(/\bbha\b|\bbht\b|butilhidroxi|etoxiquina|galato de propilo|\be ?3(10|20|21|24)\b/)) out.push('syntheticAntioxidants');
  if (mentions(/propilenglicol|propano-1,2-diol/)) out.push('propyleneGlycol');
  if (mentions(/nitrito/)) out.push('nitrite');
  if (mentions(/tocoferol|extracto de romero|extractos? ricos? en tocoferol/)) out.push('naturalAntioxidants');
  else if (!out.includes('syntheticAntioxidants') && mentions(/(?:con )?(antioxidantes|conservantes)(?: ?(?:ce|ue|aditivos))?/)) {
    out.push('unspecifiedPreservatives');
  }
  return out;
}

// ------------------------------------------------------------------ entrada

export function parseLabel(input: string): ParsedLabel {
  const text = input.replace(/[_*]/g, '').replace(/ /g, ' ');
  const s = splitSections(text);
  // Sin el título «Composición», la lista es lo que hay antes del primer apartado.
  const { list, multiple } = readIngredients(s.composition.trim() ? s.composition : s.headless);
  return {
    ingredients: list,
    analytical: readAnalytical(s.analytical, text),
    additives: readAdditives(`${s.additives}\n${s.composition}\n${s.headless}`),
    hasAdditivesSection: s.additives.trim().length > 0,
    multipleRecipes: multiple,
  };
}
