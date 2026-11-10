import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples';
import { parseLabel } from '../parse';
import { dryMatter, scoreLabel } from '../score';

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!;
const run = (id: string) => {
  const e = example(id);
  return scoreLabel(parseLabel(e.text), e.species, e.stage)!;
};

describe('lectura de la etiqueta', () => {
  it('separa composición, componentes analíticos y aditivos', () => {
    const p = parseLabel(example('carne').text);
    expect(p.ingredients.map((i) => i.name).slice(0, 3)).toEqual(['pollo fresco deshuesado', 'proteína de pollo deshidratada', 'boniato']);
    expect(p.ingredients[0]).toMatchObject({ pct: 30, kind: 'animal', named: true, fresh: true });
    expect(p.analytical).toEqual({ protein: 34, fat: 16, fibre: 3, ash: 8.5, moisture: 8 });
    expect(p.additives).toEqual(['naturalAntioxidants']);
    expect(p.hasAdditivesSection).toBe(true);
  });

  it('entiende decimales con coma y no los toma por separadores', () => {
    const p = parseLabel('Composición: pollo 26,5 %, arroz 12,5 %, maíz. Componentes analíticos: proteína bruta 26,5 %, grasa bruta 12 %.');
    expect(p.ingredients.map((i) => [i.name, i.pct])).toEqual([['pollo', 26.5], ['arroz', 12.5], ['maíz', null]]);
    expect(p.analytical.protein).toBe(26.5);
  });

  it('reconoce las categorías genéricas', () => {
    const p = parseLabel(example('economico').text);
    expect(p.ingredients.filter((i) => i.vague).map((i) => i.name)).toEqual([
      'cereales', 'carnes y subproductos animales', 'subproductos de origen vegetal', 'aceites y grasas',
    ]);
    expect(p.ingredients.at(-1)).toMatchObject({ name: 'azúcares', kind: 'sugar' });
    expect(p.additives).toEqual(expect.arrayContaining(['colorants', 'unspecifiedPreservatives']));
  });

  it('no confunde «proteína de pollo (25 %)» con la proteína bruta', () => {
    const p = parseLabel('Pollo (40 %), proteína de pollo deshidratada (25 %), arroz, grasa de pollo (8 %)');
    expect(p.analytical).toEqual({});
    expect(p.ingredients).toHaveLength(4);
  });

  it('respeta «sin colorantes»', () => {
    expect(parseLabel('Composición: pollo, arroz. Aditivos: vitamina E. Sin colorantes ni conservantes artificiales.').additives).toEqual([]);
  });

  it('lee una ficha real de Open Pet Food Facts con varias recetas', () => {
    const text =
      'Trocitos en salsa con buey: carnes y subproductos animales (36%, contiene 4% buey), cereales, subproductos vegetales (contiene 0,4% de inulina de achicoria), sustancias minerales, azúcares.\r\n' +
      '_Trocitos en salsa con pavo:_ carnes y subproductos animales (36%, contiene 4% pavo), cereales, subproductos vegetales, sustancias minerales, azúcares.\r\n' +
      '_Componentes analíticos:_ Proteína bruta: 8%, Grasa bruta: 4,5%, Fibras brutas: 0,4%, Ceniza bruta: 2,5%, Humedad: 82%\r\n' +
      '_Aditivos: Aditivos nutricionales (/kg):_ Vitamina D3: 160 UI, Vitamina E: 100 mg, Taurina: 520 mg';
    const p = parseLabel(text);
    expect(p.multipleRecipes).toBe(true);
    expect(p.ingredients.map((i) => i.name)).toEqual(['carnes y subproductos animales', 'cereales', 'subproductos vegetales', 'sustancias minerales', 'azúcares']);
    expect(p.ingredients[0].pct).toBe(36);
    expect(p.analytical).toEqual({ protein: 8, fat: 4.5, fibre: 0.4, ash: 2.5, moisture: 82 });
  });
});

describe('materia seca', () => {
  it('convierte una lata a materia seca', () => {
    const d = dryMatter(parseLabel(example('lata').text))!;
    expect(d.wet).toBe(true);
    expect(d.protein).toBeCloseTo(55, 1);
    expect(d.fat).toBeCloseTo(27.5, 1);
    expect(d.carbs).toBeCloseTo(6, 0);
  });

  it('supone un pienso seco si no se declara la humedad', () => {
    const d = dryMatter(parseLabel(example('economico').text))!;
    expect(d).toMatchObject({ moisture: 9, moistureAssumed: true, wet: false });
  });

  it('no inventa la humedad de una lata', () => {
    const p = parseLabel('Composición: pollo, caldo. Componentes analíticos: proteína bruta 10 %, grasa bruta 5 %.');
    expect(dryMatter(p)).toBeNull();
  });
});

describe('nota', () => {
  it('ordena los ejemplos como cabe esperar', () => {
    const [cheap, meaty, can] = [run('economico'), run('carne'), run('lata')];
    expect(cheap.score).toBeLessThan(40);
    expect(meaty.score).toBeGreaterThanOrEqual(80);
    expect(can.score).toBeGreaterThanOrEqual(80);
    expect(cheap.grade).toMatch(/Flojo|Deficiente/);
  });

  it('avisa si la proteína no llega al mínimo de FEDIAF', () => {
    const p = parseLabel('Composición: maíz, trigo, harina de carne. Componentes analíticos: proteína bruta 15 %, grasa bruta 8 %, fibra bruta 4 %, ceniza bruta 7 %, humedad 10 %.');
    const r = scoreLabel(p, 'dog', 'adult')!;
    expect(r.nutrients!.reasons[0]).toMatchObject({ tone: 'bad' });
    expect(r.nutrients!.reasons[0].text).toContain('por debajo del mínimo');
  });

  it('una lista de ingredientes poco clara no pasa de «Aceptable» por buenos que sean los nutrientes', () => {
    const p = parseLabel(
      'Carnes y subproductos animales (36%, contiene 4% buey), cereales, subproductos vegetales, sustancias minerales, azúcares.\n' +
        'Componentes analíticos: Proteína bruta: 8%, Grasa bruta: 4,5%, Fibras brutas: 0,4%, Ceniza bruta: 2,5%, Humedad: 82%\n' +
        'Aditivos nutricionales (/kg): Vitamina D3: 160 UI, Taurina: 520 mg',
    );
    const r = scoreLabel(p, 'cat', 'adult')!;
    expect(r.nutrients!.points).toBeGreaterThan(30);
    expect(r.score).toBe(60);
    expect(r.grade).toBe('Aceptable');
    expect(r.notes.join(' ')).toContain('poco clara');
  });

  it('con la proteína bajo el mínimo no pasa de «Flojo»', () => {
    const p = parseLabel('Composición: pollo (30 %), arroz, grasa de pollo, manzana. Componentes analíticos: proteína bruta 15 %, grasa bruta 12 %, fibra bruta 2 %, ceniza bruta 6 %, humedad 9 %. Aditivos: vitamina E.');
    const r = scoreLabel(p, 'dog', 'adult')!;
    expect(r.score).toBeLessThanOrEqual(49);
    expect(r.grade).toBe('Flojo');
  });

  it('es más exigente con un gato que con un perro', () => {
    const p = parseLabel(example('carne').text);
    expect(scoreLabel(p, 'cat', 'adult')!.nutrients!.points).toBeLessThan(scoreLabel(p, 'dog', 'adult')!.nutrients!.points);
  });

  it('da una nota parcial solo con ingredientes', () => {
    const r = scoreLabel(parseLabel('Pollo (40 %), arroz, guisantes, grasa de pollo'), 'dog', 'adult')!;
    expect(r.partial).toBe(true);
    expect(r.nutrients).toBeNull();
    expect(r.notes.join(' ')).toContain('componentes analíticos');
  });

  it('no devuelve nada si el texto no es una etiqueta', () => {
    expect(scoreLabel(parseLabel('hola, qué tal'), 'dog', 'adult')).toBeNull();
    expect(scoreLabel(parseLabel(''), 'dog', 'adult')).toBeNull();
  });

  it('la nota está siempre entre 0 y 100', () => {
    for (const e of EXAMPLES) {
      for (const sp of ['dog', 'cat'] as const) {
        const r = scoreLabel(parseLabel(e.text), sp, 'growth')!;
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
  });
});
