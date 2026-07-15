# Raport z eksperymentu — Krok 62

## Metryki zbiorcze

- `vertex_precision`: **1.000**
- `vertex_recall`: **1.000**
- `edge_precision`: **1.000**
- `edge_recall`: **1.000**
- `label_accuracy`: **0.556**

## Wyniki próbek

### triangle_clean.png
- `vertex_precision`: 1.000
- `vertex_recall`: 1.000
- `edge_precision`: 1.000
- `edge_recall`: 1.000
- `label_accuracy`: 0.667

### path_clean.png
- `vertex_precision`: 1.000
- `vertex_recall`: 1.000
- `edge_precision`: 1.000
- `edge_recall`: 1.000
- `label_accuracy`: 0.500

### square_diagonal_noisy.png
- `vertex_precision`: 1.000
- `vertex_recall`: 1.000
- `edge_precision`: 1.000
- `edge_recall`: 1.000
- `label_accuracy`: 0.500

## Wniosek

W kontrolowanych rysunkach komputerowych klasyczne metody OpenCV poprawnie odtworzyły położenia okrągłych wierzchołków oraz proste krawędzie. OCR był wyraźnie mniej stabilny: średnia dokładność etykiet wyniosła 0.556. W praktycznej integracji wynik powinien być prezentowany użytkownikowi do korekty przed utworzeniem obiektów w Route Editorze.

Nie należy przenosić tych wyników bezpośrednio na fotografie i szkice odręczne. Dla takich danych potrzebne będą dodatkowe próbki, normalizacja perspektywy, rozdzielanie tekstu od linii i prawdopodobnie model uczony.