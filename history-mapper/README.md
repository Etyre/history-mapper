# History Mapper

A tool for building timeline visualizations of historical events: spans on a
vertical year axis, with causal arrows between them, plus a spreadsheet-like
editor for the underlying data. The visualization can be exported as a single
standalone HTML file for embedding on any site.

## Code vs. data

The app is deliberately split so you can use the software with your own
timeline:

| Path            | What it is                                                     |
|-----------------|----------------------------------------------------------------|
| `src/`          | The application code. Contains no timeline content.            |
| `data.json`     | The timeline content (the "database"). One JSON file. Ships as a small sample. |
| `timelines/`    | Other timelines, selectable via `HISTORY_MAPPER_DATA` (see below). |
| `vite.config.ts`| Dev server + a tiny file-backed API that reads/writes the data file. |

Nothing in `src/` knows about any particular historical event. Swap the data
file and you have a different timeline.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Edits made in the UI are saved straight back to the data file, and the app
polls the file every 2s so external edits (a text editor, a script, an AI
assistant) show up live.

## Making your own timeline

Pick one:

1. **Start empty.** Delete or rename `data.json`. The app starts with no spans;
   add some and a fresh `data.json` is written.
2. **Point at a different file.** Set `HISTORY_MAPPER_DATA` (relative to this
   folder, or absolute) either in the environment or in a `.env` file:

   ```bash
   cp .env.example .env
   # edit .env → HISTORY_MAPPER_DATA=my-timeline.json
   ```

   This lets you keep several timelines side by side and switch between them.
3. **Import/Export JSON** from the UI to move a timeline in or out.

The bundled `data.json` is a six-span sample that exercises every feature
(sub-events, arrows, a bidirectional arrow, and a `continuesAs` chain). The
author's own timeline (US/Western history with a focus on economics,
technology, and culture) lives in `timelines/western-history.json`; point
`HISTORY_MAPPER_DATA` at it to use it. Feel free to fork it or ignore it.

## Data format

```jsonc
{
  "spans": [
    {
      "id": "uuid",
      "title": "The Cold War",
      "startYear": 1947,
      "endYear": 1991,              // or "ongoing"
      "spanType": "Politics",       // Economics | Technology | Politics | Culture | Subculture | Demographics
      "tags": ["geopolitics"],      // optional
      "continuesAs": "other-uuid",  // optional: span this transitions into
      "subEvents": [
        { "id": "uuid", "date": 1962, "label": "Cuban Missile Crisis" }
      ],
      "causalImpacts": [
        {
          "id": "uuid",
          "targetSpanId": "other-uuid",
          "sourceAttachment": "end",     // "start" | "middle" | "end" | <year>
          "targetAttachment": "start",   // "start" | "middle" | "end" | <year>
          "annotation": "Shown on hover",
          "bidirectional": false          // optional
        }
      ]
    }
  ]
}
```

Span colors are derived from `spanType` (see `src/utils/colors.ts`).

## Exporting a standalone page

Click **Export Standalone HTML** in the app header. The result is a single
self-contained `.html` file with the current timeline baked in — no server
needed.

## Dev-server API

The Vite plugin in `vite.config.ts` exposes a small API against the data file,
handy for scripts:

- `GET  /api/data` — whole state
- `POST /api/data` — replace whole state
- `POST /api/data/spans` — add one span
- `PATCH /api/data/spans/:id` — merge updates into one span
