# Eksperyment rozpoznawania grafiki — Krok 62

To jest **osobny eksperyment**, niewłączony jeszcze do głównego interfejsu Route Editora.
Jego celem jest sprawdzenie, czy na prostych komputerowo generowanych obrazach można:

1. wykryć okrągłe wierzchołki,
2. odtworzyć krawędzie,
3. odczytać krótkie etykiety przez OCR,
4. złożyć wynik do formatu JSON grafu.

## Uruchomienie

Z katalogu zawierającego `manage.py`:

```bash
python -m experiments.image_recognition.run_experiment
```

Wyniki znajdą się w `experiments/image_recognition/results/`:

- `summary.json` — metryki zbiorcze,
- `<próbka>.json` — wykryty graf i metryki,
- `<próbka>_annotated.png` — obraz kontrolny z nałożonym wynikiem.

## Zastosowane narzędzia

- OpenCV: HoughCircles, progowanie i analiza pikseli na odcinku,
- Tesseract przez `pytesseract`: OCR pojedynczych etykiet,
- Pillow: deterministyczne generowanie próbek,
- JSON: wynik gotowy do późniejszego mapowania na `DrawingObject`.

## Ograniczenia

Eksperyment zakłada białe tło, czarne okrągłe wierzchołki, proste krawędzie i etykiety blisko prawego górnego brzegu wierzchołka. Nie jest to jeszcze rozwiązanie dla zdjęć, szkiców odręcznych, strzałek, nachodzących linii ani dowolnych diagramów.

## Eksport do Route Editora — Krok 63

Po uruchomieniu eksperymentu każda próbka tworzy również plik `results/*_route_editor.json`.
Jest to dokument schematu 1, który można bezpośrednio wczytać w aplikacji przez **Importuj JSON**.
Rozpoznane etykiety są osobnymi `label.relative`, a metadane `requires_human_review` przypominają, że wynik OCR powinien zostać zweryfikowany przez użytkownika.
