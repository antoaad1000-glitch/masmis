# Masmis question bank

This folder contains 10 generated French naturalisation/civic quiz batches.

- 10 JSON files
- 50 questions per file
- 500 questions total
- Imported questions keep their `approved` value unless you run the importer with `--approve`.

Import for admin review:

```powershell
pnpm import:questions
```

Import directly as approved for local gameplay testing:

```powershell
pnpm import:questions -- --approve
```

Then start the app:

```powershell
pnpm dev
```
