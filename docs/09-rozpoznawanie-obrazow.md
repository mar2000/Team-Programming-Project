# 9. Rozpoznawanie rysunków z obrazu

## 9.1. Status modułu

Rozpoznawanie obrazów jest modułem eksperymentalnym. Jego zadaniem jest zaproponowanie struktury prostego grafu lub rysunku geometrycznego na podstawie bitmapy. Wynik nie jest traktowany jako bezbłędny i powinien zostać sprawdzony przez użytkownika.

## 9.2. Dwa poziomy implementacji

Projekt zawiera:

- integrację importu obrazu w aplikacji Django w `routes/image_recognition_import.py`;
- osobne eksperymenty w `experiments/image_recognition/`.

## 9.3. Przetwarzanie w aplikacji

Główny przepływ obejmuje:

1. odczyt obrazu;
2. konwersję do reprezentacji numerycznej;
3. wykrywanie pełnych punktów;
4. analizę zaciemnienia wzdłuż potencjalnych odcinków;
5. wykrywanie okręgów;
6. usuwanie duplikatów punktów;
7. tworzenie obrazu diagnostycznego;
8. pokazanie formularza korekty;
9. konwersję zaakceptowanego wyniku do obiektów rysunku.

## 9.4. Moduły eksperymentalne

- `detect_vertices.py` — wykrywanie punktów i wierzchołków;
- `detect_edges.py` — wykrywanie odcinków;
- `detect_labels.py` — OCR krótkich etykiet;
- `reconstruct_graph.py` — składanie elementów w strukturę;
- `to_route_editor.py` — konwersja do formatu aplikacji;
- `generate_samples.py` — tworzenie próbek kontrolowanych;
- `run_experiment.py` — uruchamianie zestawu eksperymentów.

## 9.5. Zastosowane biblioteki

- OpenCV — kontury, linie, okręgi i operacje obrazowe;
- NumPy — reprezentacja i obliczenia macierzowe;
- Pillow — wczytywanie, przygotowanie i generowanie próbek;
- pytesseract — OCR etykiet;
- JSON — zapis wyniku pośredniego i formatu importu.

## 9.6. Dane testowe

Katalog `samples/` zawiera przykładowe obrazy i dane referencyjne. `results/` zawiera wyniki JSON, adnotowane obrazy oraz dokumenty gotowe do importu.

## 9.7. Ograniczenia

Najlepsze wyniki uzyskuje się dla:

- jasnego, jednolitego tła;
- ciemnych, wyraźnych linii;
- komputerowo generowanych rysunków;
- małej liczby nakładających się obiektów;
- krótkich etykiet.

Zdjęcia kartek i szkice odręczne wymagają potencjalnie:

- korekcji perspektywy;
- usuwania cieni;
- filtracji szumu;
- łączenia przerwanych linii;
- normalizacji grubości;
- bardziej zaawansowanego OCR;
- ręcznej korekty.
