# 3. Model danych i format obiektów

## 3.1. Model `Drawing`

Model reprezentuje cały dokument użytkownika.

| Pole | Typ | Znaczenie |
|---|---|---|
| `user` | ForeignKey do `User` | właściciel dokumentu |
| `title` | `CharField(120)` | nazwa widoczna na liście |
| `mode` | `CharField(30)` | `graph`, `geometry` lub `plot` |
| `metadata` | `JSONField` | dodatkowe dane dokumentu |
| `settings` | `JSONField` | ustawienia płótna i eksportu |
| `created_at` | datetime | czas utworzenia |
| `updated_at` | datetime | czas ostatniej modyfikacji |

Dokumenty są domyślnie sortowane malejąco według czasu aktualizacji, a następnie utworzenia.

## 3.2. Model `DrawingObject`

Model reprezentuje jeden element dokumentu.

| Pole | Typ | Znaczenie |
|---|---|---|
| `drawing` | ForeignKey do `Drawing` | dokument nadrzędny |
| `object_id` | `CharField(64)` | stabilny identyfikator logiczny |
| `type` | `CharField(100)` | namespacowany typ obiektu |
| `data` | `JSONField` | dane semantyczne zależne od typu |
| `style` | `JSONField` | dane wyglądu |
| `order` | liczba dodatnia | kolejność obiektu |
| `created_at` | datetime | czas utworzenia |
| `updated_at` | datetime | czas modyfikacji |

Para `(drawing, object_id)` jest unikalna. Ten sam identyfikator może występować w różnych dokumentach, ale nie dwa razy w jednym dokumencie.

## 3.3. Dlaczego dane są przechowywane w JSON

Typy obiektów mają różne struktury. Punkt potrzebuje współrzędnych, krawędź dwóch identyfikatorów, okrąg środka i promienia, a wykres listy serii. JSON pozwala utrzymać jeden model tabeli przy zachowaniu elastyczności.

Kosztem tej decyzji jest konieczność ręcznej walidacji. Dlatego backend sprawdza payload przed zapisem i stosuje wyspecjalizowane walidatory.

## 3.4. Ogólny format obiektu API

```json
{
  "object_id": "p1",
  "type": "geometry.point",
  "data": {
    "x": 320,
    "y": 180,
    "label": "A"
  },
  "style": {
    "fill": "#111827",
    "radius": 6,
    "showLabel": true
  },
  "order": 10
}
```

Odpowiedź API zawiera dodatkowo klucz bazy danych, obliczoną listę zależności i znaczniki czasu.

## 3.5. Przykładowe rodziny typów

### Obiekty grafowe

- `graph.vertex` — wierzchołek z pozycją i etykietą;
- `graph.edge` — krawędź odwołująca się do dwóch wierzchołków i flagi skierowania.

### Obiekty geometryczne podstawowe

- `geometry.point` — punkt swobodny;
- `geometry.segment` — odcinek między punktami;
- `geometry.circle` — okrąg oparty na środku i punkcie promienia lub danych równoważnych;
- `geometry.polygon` — wielokąt odwołujący się do listy punktów.

### Tekst i etykiety

- tekst LaTeX umieszczony niezależnie;
- etykieta względna przypięta do innego obiektu i przechowująca przesunięcie.

### Wykres

- `plot.chart` — obiekt agregujący serie danych, funkcje i konfigurację osi.

### Obiekty konstrukcyjne

Zarejestrowane typy obejmują między innymi:

- punkt dzielący odcinek w zadanym stosunku;
- przecięcie prostych;
- rzut prostokątny na prostą;
- rzut na odcinek;
- najbliższy punkt okręgu;
- przecięcia prostej z okręgiem;
- przecięcia dwóch okręgów;
- środek okręgu opisanego;
- ortocentrum;
- środek okręgu dziewięciu punktów;
- środek ciężkości;
- środek okręgu wpisanego;
- środek okręgu dopisanego;
- punkty styczności okręgów wpisanego i dopisanych;
- odbicie względem prostej;
- obrót wokół punktu;
- symetrię środkową;
- jednokładność;
- translację o wektor.

## 3.6. Zależności zapisane w danych

Zależność nie jest osobną tabelą. Wynika z pól w `data`. Przykładowo:

```json
{
  "type": "geometry.segment",
  "data": {
    "startId": "p1",
    "endId": "p2"
  }
}
```

Funkcje w `dependencies.py` znają nazwy pól referencyjnych i potrafią:

- odczytać identyfikatory zależności;
- znaleźć obiekty zależne;
- policzyć domknięcie zależności;
- zmienić identyfikatory podczas kopiowania;
- ustalić kolejność topologiczną.

## 3.7. Ustawienia dokumentu

Domyślne ustawienia mają strukturę:

```json
{
  "canvas": {
    "width": 900,
    "height": 520,
    "gridSize": 50,
    "showGrid": true,
    "snapToGrid": false
  },
  "tikz": {
    "scale": 100
  }
}
```

Backend ogranicza wartości do bezpiecznych zakresów:

- szerokość: 300–3000;
- wysokość: 200–2000;
- rozmiar siatki: 5–300;
- skala TikZ: 1–1000.
