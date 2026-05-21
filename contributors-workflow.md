# Contributors-Workflow

## Regel
Wer mindestens 3 Issues geschrieben hat, kommt auf die Liste.

## Contributor hinzufügen

```bash
npx all-contributors-cli add <github-username> <typ1>,<typ2>
git add README.md .all-contributorsrc
git commit -m "community: @<github-username> als Contributor hinzugefügt (<typen>)"
git push origin main
```

## Typen
| Typ | Symbol | Bedeutung |
|-----|--------|-----------|
| `code` | 💻 | Code-Beiträge |
| `test` | ⚠️ | Tests schreiben |
| `userTesting` | 📓 | Beta-Tests / manuelles Testen |
| `bug` | 🐛 | Bugs gemeldet |
| `ideas` | 🤔 | Ideen & Konzepte |
| `design` | 🎨 | Grafik / UI |
| `doc` | 📖 | Dokumentation |
