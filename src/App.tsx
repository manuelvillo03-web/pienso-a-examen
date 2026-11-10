import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { EXAMPLES } from './core/examples';
import { parseLabel, type Ingredient, type Kind } from './core/parse';
import { FEDIAF, type Species, type Stage } from './core/reference';
import { scoreLabel, type Block, type Result } from './core/score';
import { isBarcode, lookupBarcode } from './lib/opff';

const STORE = 'pienso.ultimo.v1';

const KIND: Record<Kind, string> = {
  animal: 'Origen animal', fat: 'Grasa', cereal: 'Cereal', starch: 'Almidón o legumbre', plantProtein: 'Proteína vegetal',
  fibre: 'Fibra', veg: 'Fruta o verdura', sugar: 'Azúcar', mineral: 'Minerales', water: 'Agua o caldo', other: 'Otros',
};

const es = (v: number, d = 1) => v.toFixed(d).replace('.', ',').replace(/,0$/, '');

function load(): { text: string; species: Species; stage: Stage } {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const v = JSON.parse(raw);
      if (typeof v.text === 'string') return { text: v.text, species: v.species === 'cat' ? 'cat' : 'dog', stage: v.stage === 'growth' ? 'growth' : 'adult' };
    }
  } catch {
    // Sin almacenamiento (modo privado): se empieza en blanco.
  }
  return { text: '', species: 'dog', stage: 'adult' };
}

export default function App() {
  const [initial] = useState(load);
  const [text, setText] = useState(initial.text);
  const [species, setSpecies] = useState<Species>(initial.species);
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<{ state: 'idle' | 'busy' | 'done'; message?: string; tone?: 'ok' | 'warn' }>({ state: 'idle' });
  const [product, setProduct] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  const parsed = useMemo(() => parseLabel(text), [text]);
  const result = useMemo(() => (text.trim() ? scoreLabel(parsed, species, stage) : null), [parsed, text, species, stage]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ text, species, stage }));
    } catch {
      // No pasa nada si no se puede guardar.
    }
  }, [text, species, stage]);

  const loadExample = (id: string) => {
    const e = EXAMPLES.find((x) => x.id === id)!;
    setText(e.text);
    setSpecies(e.species);
    setStage(e.stage);
    setProduct(null);
    setLookup({ state: 'idle' });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const search = async () => {
    if (!isBarcode(code)) {
      setLookup({ state: 'done', tone: 'warn', message: 'Escribe los números que hay bajo el código de barras (entre 8 y 14 cifras).' });
      return;
    }
    setLookup({ state: 'busy' });
    const r = await lookupBarcode(code);
    if (r.status === 'found') {
      setText(r.product.text);
      setProduct([r.product.brand, r.product.name].filter(Boolean).join(' · ') || null);
      setLookup({ state: 'done', tone: 'ok', message: 'Encontrado en Open Pet Food Facts. Comprueba que el texto coincide con tu envase.' });
    } else if (r.status === 'empty') {
      setLookup({ state: 'done', tone: 'warn', message: `«${r.product.name || 'Este producto'}» está en la base abierta, pero nadie ha copiado aún sus ingredientes. Pégalos tú abajo.` });
    } else if (r.status === 'missing') {
      setLookup({ state: 'done', tone: 'warn', message: 'Ese código no está en la base abierta. Copia la etiqueta abajo y lo analizamos igual.' });
    } else {
      setLookup({ state: 'done', tone: 'warn', message: 'No hemos podido consultar la base abierta. Copia la etiqueta abajo.' });
    }
  };

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="./">
          <Bowl />
          <span>Pienso a examen</span>
        </a>
        <nav>
          <a href="#metodo">Cómo puntuamos</a>
        </nav>
      </header>

      <main>
        <section className="intro">
          <h1>¿Qué lleva de verdad la comida de tu perro o tu gato?</h1>
          <p>
            Copia la etiqueta del saco o de la lata y te decimos, en claro, cuánta carne lleva, cuánto relleno y si
            cumple los mínimos europeos de nutrición. Gratis y sin registrarte.
          </p>
        </section>

        <section className="panel" aria-label="Datos del alimento">
          <div className="choices">
            <Segmented label="Es para" value={species} onChange={setSpecies} options={[['dog', 'Perro'], ['cat', 'Gato']]} />
            <Segmented label="Edad" value={stage} onChange={setStage}
              options={[['adult', 'Adulto'], ['growth', species === 'dog' ? 'Cachorro' : 'Gatito']]} />
          </div>

          <label className="field" htmlFor="etiqueta">
            <span className="field-label">La etiqueta</span>
            <span className="field-help">
              Copia la composición y los componentes analíticos del envase o de la web de la tienda. Si están los
              aditivos, mejor.
            </span>
          </label>
          <textarea
            id="etiqueta"
            value={text}
            onChange={(e) => { setText(e.target.value); setProduct(null); }}
            rows={8}
            spellCheck={false}
            placeholder={'Composición: pollo (26 %), arroz, maíz, grasa de pollo…\nComponentes analíticos: proteína bruta 26 %, grasa bruta 14 %, fibra bruta 2,5 %, ceniza bruta 7 %.'}
          />

          <div className="under">
            <div className="examples">
              <span>Prueba con un ejemplo:</span>
              {EXAMPLES.map((e) => (
                <button key={e.id} type="button" className="link" onClick={() => loadExample(e.id)}>{e.title}</button>
              ))}
            </div>
            {text ? <button type="button" className="link quiet" onClick={() => { setText(''); setProduct(null); }}>Borrar</button> : null}
          </div>

          <form className="barcode" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <label htmlFor="codigo">¿Tienes el envase delante? Busca por código de barras</label>
            <div className="barcode-row">
              <input id="codigo" inputMode="numeric" autoComplete="off" value={code} placeholder="8410650581392"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 14))} />
              <button type="submit" className="button" disabled={lookup.state === 'busy'}>
                {lookup.state === 'busy' ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {lookup.message ? <p className={`hint ${lookup.tone}`} role="status">{lookup.message}</p> : null}
          </form>
        </section>

        <section ref={resultRef} className="result" aria-live="polite">
          {result ? (
            <Report result={result} ingredients={parsed.ingredients} species={species} stage={stage} product={product} />
          ) : text.trim() ? (
            <div className="empty">
              <h2>Aquí no vemos una etiqueta</h2>
              <p>
                Hace falta la lista de ingredientes separada por comas, o los componentes analíticos con sus
                porcentajes. Mira uno de los ejemplos para ver la forma.
              </p>
            </div>
          ) : (
            <div className="empty">
              <h2>Dónde está la etiqueta</h2>
              <p>
                En el saco o la lata, en letra pequeña, bajo los títulos «Composición» y «Componentes analíticos».
                Las tiendas online también la publican en la ficha de cada producto, y de ahí se puede copiar y pegar.
              </p>
            </div>
          )}
        </section>

        <Method />
      </main>

      <footer className="foot">
        <p>
          Esta página informa, no receta. No sustituye al veterinario: si tu animal tiene una enfermedad o una dieta
          pautada, manda lo que diga él.
        </p>
        <p>
          La búsqueda por código de barras usa <a href="https://world.openpetfoodfacts.org" rel="noopener">Open Pet Food Facts</a>,
          {' '}una base de datos abierta (ODbL). Lo que escribes se queda en tu navegador.
        </p>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ informe

function Report({ result, ingredients, species, stage, product }: {
  result: Result; ingredients: Ingredient[]; species: Species; stage: Stage; product: string | null;
}) {
  const ref = FEDIAF[species][stage];
  const d = result.dry;
  const level = result.score >= 65 ? 'good' : result.score >= 50 ? 'mid' : 'low';
  return (
    <>
      <div className={`verdict ${level}`}>
        <div className="score" aria-label={`Nota: ${result.score} sobre 100`}>
          <span className="score-n">{result.score}</span>
          <span className="score-of">/ 100</span>
        </div>
        <div className="verdict-text">
          {product ? <p className="product">{product}</p> : null}
          <h2>{result.grade}</h2>
          <p>{summary(result)}</p>
          {result.partial ? <p className="partial">Nota parcial: falta parte de la etiqueta.</p> : null}
        </div>
      </div>

      {result.notes.map((n) => <p key={n} className="note">{n}</p>)}

      <div className="blocks">
        {result.ingredients ? <BlockCard title="Ingredientes" block={result.ingredients} /> : null}
        {result.nutrients ? <BlockCard title="Nutrientes" block={result.nutrients} /> : null}
        <BlockCard title="Aditivos" block={result.additives} />
      </div>

      {d ? (
        <div className="card">
          <h3>Los números, sin el agua</h3>
          <p className="card-help">
            {d.wet
              ? `Una lata es casi toda agua (${es(d.moisture)} %). Para compararla con un pienso hay que quitarla: es lo que se llama materia seca.`
              : 'Para comparar alimentos entre sí se quita el agua. Es lo que se llama materia seca.'}
          </p>
          <table>
            <thead>
              <tr><th scope="col">Nutriente</th><th scope="col">Sobre materia seca</th><th scope="col">Mínimo FEDIAF</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Proteína</th><td>{es(d.protein)} %</td><td>{es(ref.proteinMin)} %</td></tr>
              <tr><th scope="row">Grasa</th><td>{es(d.fat)} %</td><td>{es(ref.fatMin)} %</td></tr>
              <tr><th scope="row">Hidratos (estimados)</th><td>{d.carbsApprox ? '≈ ' : ''}{es(d.carbs)} %</td><td>—</td></tr>
              {d.fibre !== null ? <tr><th scope="row">Fibra</th><td>{es(d.fibre)} %</td><td>—</td></tr> : null}
              {d.ash !== null ? <tr><th scope="row">Ceniza</th><td>{es(d.ash)} %</td><td>—</td></tr> : null}
            </tbody>
          </table>
          <p className="card-help">
            Los hidratos no vienen en la etiqueta: se calculan restando a 100 todo lo demás. FEDIAF no fija un mínimo
            ni un máximo para ellos.
          </p>
        </div>
      ) : null}

      {result.ingredients ? (
        <div className="card">
          <h3>La lista, de más a menos</h3>
          <p className="card-help">Los ingredientes van por orden de peso: los primeros son los que mandan.</p>
          <ol className="ingredients">
            {ingredients.map((i, n) => (
              <li key={`${n}-${i.raw}`} className={`k-${i.kind}${i.vague ? ' vague' : ''}`}>
                <span className="i-name">{i.name}{i.pct !== null ? <em> {es(i.pct)} %</em> : null}</span>
                <span className="i-kind">{KIND[i.kind]}{i.vague ? ' · sin concretar' : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </>
  );
}

function summary(r: Result): string {
  const worst = [r.ingredients, r.nutrients, r.additives]
    .flatMap((b) => b?.reasons ?? [])
    .find((x) => x.tone === 'bad');
  const best = [r.ingredients, r.nutrients].flatMap((b) => b?.reasons ?? []).find((x) => x.tone === 'good');
  if (r.score >= 65) return best ? best.text : 'Una etiqueta clara y bien compuesta.';
  return worst ? worst.text : best ? best.text : 'Ni destaca ni falla en nada grave.';
}

function BlockCard({ title, block }: { title: string; block: Block }) {
  const pct = Math.round((block.points / block.max) * 100);
  return (
    <div className="card block">
      <div className="block-head">
        <h3>{title}</h3>
        <span className="block-points">{es(block.points)} <small>de {block.max}</small></span>
      </div>
      <div className="bar" role="img" aria-label={`${pct} por ciento`}><span style={{ width: `${pct}%` }} /></div>
      <ul className="reasons">
        {block.reasons.map((x) => <li key={x.text} className={x.tone}>{x.text}</li>)}
      </ul>
    </div>
  );
}

function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div>
        {options.map(([v, text]) => (
          <label key={v} className={v === value ? 'on' : ''}>
            <input type="radio" name={label} checked={v === value} onChange={() => onChange(v)} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Bowl() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <path d="M4 15h24l-2.4 9.2A3 3 0 0 1 22.7 26H9.3a3 3 0 0 1-2.9-1.8z" fill="currentColor" />
      <circle cx="11" cy="10" r="2.6" fill="var(--accent)" />
      <circle cx="17" cy="7.5" r="2.6" fill="var(--accent)" />
      <circle cx="22" cy="11" r="2.6" fill="var(--accent)" />
    </svg>
  );
}

// ------------------------------------------------------------------ método

function Method() {
  return (
    <section id="metodo" className="method">
      <h2>Cómo puntuamos</h2>
      <p>
        La nota sale solo de lo que dice la etiqueta, con reglas fijas que puedes leer aquí. No cobramos a ninguna
        marca y no hay ninguna lista de productos recomendados.
      </p>
      <div className="method-grid">
        <div>
          <h3>Ingredientes · 45 puntos</h3>
          <p>
            Qué va primero, cuántos de los cinco primeros son de origen animal, qué porcentaje se declara y si la
            etiqueta nombra cada ingrediente o se esconde tras categorías como «carnes y subproductos animales» o
            «cereales». Resta el azúcar añadido y repartir el cereal en varios nombres.
          </p>
        </div>
        <div>
          <h3>Nutrientes · 40 puntos</h3>
          <p>
            Proteína y grasa, sin el agua, frente a los mínimos de la guía nutricional de FEDIAF (julio de 2024), la
            referencia de la industria europea. Los hidratos se estiman por diferencia; el umbral a partir del cual
            restan es criterio nuestro, más estricto para gatos.
          </p>
        </div>
        <div>
          <h3>Aditivos · 15 puntos</h3>
          <p>
            Restan los colorantes, los antioxidantes sintéticos, el propilenglicol y los nitritos. Todos están
            autorizados; simplemente hay recetas que no los necesitan.
          </p>
        </div>
      </div>
      <h3>Dos topes</h3>
      <ul>
        <li>Si la lista de ingredientes saca menos del 45 % de sus puntos, la nota no pasa de 60.</li>
        <li>Si la proteína declarada no llega al mínimo de FEDIAF, la nota no pasa de 49.</li>
      </ul>
      <h3>Lo que esta nota no sabe</h3>
      <ul>
        <li>La calidad real de la materia prima ni su digestibilidad: eso no viene en ninguna etiqueta.</li>
        <li>Si un alimento le sienta bien a tu animal en concreto, con su edad, su peso y su salud.</li>
        <li>Vitaminas y minerales al detalle. Un alimento «completo» debe cubrirlos por ley.</li>
      </ul>
    </section>
  );
}
