# Pienso a examen

Web gratuita que analiza la etiqueta de un alimento para perros o gatos: se
pega la composición y los componentes analíticos y devuelve una nota de 0 a
100 con sus motivos. Todo se calcula en el navegador; no hay servidor.

- `src/core/parse.ts`: lee la etiqueta (ingredientes, componentes analíticos, aditivos).
- `src/core/score.ts`: calcula la nota. Los mínimos de proteína y grasa son de
  FEDIAF (julio de 2024, tablas III-3 y III-4, en `src/core/reference.ts`); el
  resto de umbrales son criterio propio.
- `src/lib/opff.ts`: búsqueda por código de barras en Open Pet Food Facts (ODbL).

```bash
npm install
npm test
npm run dev
npm run build
```
