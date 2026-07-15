# Rozpoznawanie rysunków z obrazu

Katalog zawiera eksperymentalny moduł przetwarzania obrazów używany przez Route Editor do odtwarzania prostych rysunków geometrycznych i grafowych.

## Zakres działania

Moduł analizuje przede wszystkim obrazy o jasnym tle, zawierające:

- pełne punkty,
- proste odcinki,
- okręgi,
- krótkie etykiety tekstowe,
- delikatną siatkę w tle.

Wynik analizy może zostać przekształcony do obiektów `DrawingObject` i przed importem powinien zostać zweryfikowany przez użytkownika.

## Główne elementy

- `detect_vertices.py` — wykrywanie punktów i wierzchołków,
- `detect_edges.py` — wykrywanie odcinków,
- `detect_labels.py` — rozpoznawanie krótkich etykiet,
- `reconstruct_graph.py` — składanie wykrytych elementów w strukturę grafu,
- `to_route_editor.py` — konwersja wyniku do formatu Route Editora,
- `run_experiment.py` — uruchomienie analizy na próbkach,
- `generate_samples.py` — generowanie kontrolowanych obrazów testowych,
- `samples/` — obrazy wejściowe i dane referencyjne,
- `results/` — przykładowe wyniki oraz obrazy diagnostyczne.

## Uruchomienie

Z katalogu zawierającego `manage.py`:

```bash
python -m experiments.image_recognition.run_experiment
```

Wyniki zostaną zapisane w `experiments/image_recognition/results/`.

## Zastosowane narzędzia

- OpenCV do analizy obrazu, wykrywania konturów, linii i okręgów,
- Tesseract przez `pytesseract` do OCR,
- Pillow do przygotowywania próbek,
- JSON do zapisu wyniku i wymiany danych z aplikacją.

## Ograniczenia

Moduł najlepiej działa na czystych, komputerowo generowanych rysunkach. Zdjęcia kartek i szkice odręczne mogą wymagać dodatkowej korekcji perspektywy, usuwania cieni, wygładzania linii oraz ręcznej korekty rozpoznanych elementów.
